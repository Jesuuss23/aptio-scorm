#!/usr/bin/env bash
# HU-1405 · Tarea efímera de base de datos del despliegue: registra la tarea de migraciones con la imagen nueva de la
# API, la corre una vez en Fargate (`pnpm db:deploy` y `pnpm --filter @aptio/db verificar-organizaciones`) y falla si
# la tarea no termina con código 0, antes de que se actualicen los servicios.
#   infra/scripts/migrar.sh <pila> <imagen-api>
# Necesita aws y jq, y credenciales con ecs:RegisterTaskDefinition, ecs:RunTask, ecs:DescribeTasks e iam:PassRole.
set -euo pipefail
PILA="$1"
IMAGEN="$2"

salida() { aws cloudformation describe-stacks --stack-name "$PILA" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
CLUSTER="$(salida ClusterNombre)"
FAMILIA="$(salida FamiliaMigracion)"
SUBREDES="$(salida SubredesTareas)"
SG="$(salida SgTareasId)"

# La misma definición que creó CDK (secretos, registros y roles), solo con la imagen de este despliegue.
aws ecs describe-task-definition --task-definition "$FAMILIA" --query taskDefinition --output json \
  | jq --arg imagen "$IMAGEN" '.containerDefinitions[0].image = $imagen
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
  > /tmp/migracion.json
DEFINICION="$(aws ecs register-task-definition --cli-input-json file:///tmp/migracion.json --query taskDefinition.taskDefinitionArn --output text)"
echo "Tarea de migraciones: $DEFINICION"

TAREA="$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$DEFINICION" --launch-type FARGATE --count 1 \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBREDES],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --started-by "despliegue-${GITHUB_RUN_ID:-manual}" --query 'tasks[0].taskArn' --output text)"
echo "Corriendo $TAREA"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"

CODIGO="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" --query 'tasks[0].containers[0].exitCode' --output text)"
MOTIVO="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" --query 'tasks[0].stoppedReason' --output text)"
echo "La tarea terminó con código $CODIGO ($MOTIVO)"
# Lo último que escribió la tarea queda en el registro del despliegue.
aws logs get-log-events --log-group-name "/aptio/${ENTORNO:-pruebas}/migracion" --log-stream-name "migracion/migracion/${TAREA##*/}" \
  --limit 40 --query 'events[].message' --output text 2>/dev/null || true
[ "$CODIGO" = "0" ]
