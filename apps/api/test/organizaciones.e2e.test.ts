// HU-1701 · CP-139 · Aislamiento entre organizaciones contra PostgreSQL real. Dos organizaciones (A y B), cada una con
// cliente, kit, proyecto, curso, recurso y exportación. El administrador de A pide por id cada recurso de B (lectura,
// edición y borrado): recibe el mismo 404 que con un id que no existe, y queda ACCESO_OTRA_ORGANIZACION en la
// auditoría de plataforma (sin organización: la ve solo el superadmin). Se salta si no hay DATABASE_URL.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashearClave, prisma, Rol } from '@aptio/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { ACCION_ACCESO_OTRA_ORGANIZACION, idsDeRuta } from '../src/comun/acceso-cruzado.js';

const hayBase = Boolean(process.env.DATABASE_URL);
const CLAVE = 'clave-de-prueba-123';
const sufijo = Math.random().toString(36).slice(2, 8);
const correo = (nombre: string) => `${nombre}-${sufijo}@organizaciones.test`;
const loto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/curso-esperado-es.json', import.meta.url), 'utf8'));
const kitLoto = () => JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/entrada/kit.json', import.meta.url), 'utf8'));
const NO_EXISTE = '00000000-0000-4000-8000-0000000017ff';

interface Datos { orgId: string; adminId: string; clienteId: string; kitId: string; proyectoId: string; cursoId: string; pantallaId: string; recursoId: string; exportacionId: string; generacionId: string; productorId: string }

let app: INestApplication;
let servidor: ReturnType<INestApplication['getHttpServer']>;
let A: Datos;
let B: Datos;
const cookies: Record<string, string> = {};

async function poblar(nombre: string): Promise<Datos> {
  const org = await prisma.organizacion.create({ data: { nombre: `Org ${nombre}`, slug: `org-${nombre}-${sufijo}` } });
  const hashClave = await hashearClave(CLAVE);
  const admin = await prisma.usuario.create({ data: { nombre: `Admin ${nombre}`, email: correo(`admin-${nombre}`), rol: Rol.ADMINISTRADOR, organizacionId: org.id, hashClave, emailVerificado: true } });
  const productor = await prisma.usuario.create({ data: { nombre: `Productor ${nombre}`, email: correo(`productor-${nombre}`), rol: Rol.PRODUCTOR, organizacionId: org.id, hashClave, emailVerificado: true } });
  const cliente = await prisma.cliente.create({
    data: { organizacionId: org.id, nombre: `Cliente ${nombre}`, kit: { create: { estilo: 'Corporativo', paleta: kitLoto().paleta, tipografias: kitLoto().tipografias, voces: {} } } },
    include: { kit: true },
  });
  const proyecto = await prisma.proyecto.create({ data: { organizacionId: org.id, clienteId: cliente.id, nombre: `Proyecto ${nombre}`, creadoPorId: admin.id } });
  const documento = loto();
  const curso = await prisma.curso.create({ data: { organizacionId: org.id, proyectoId: proyecto.id, versionEsquema: '0.2.0', documento } });
  const recurso = await prisma.recurso.create({ data: { organizacionId: org.id, clienteId: cliente.id, tipo: 'IMAGEN', origen: 'SUBIDO', claveS3: `org/${org.id}/r-${sufijo}.png`, mime: 'image/png', bytes: 10n, hash: 'x', nombre: 'r.png' } });
  const exportacion = await prisma.exportacion.create({ data: { organizacionId: org.id, cursoId: curso.id, versionCurso: 1, formato: 'SCORM12', modoIdioma: 'unico', creadoPorId: admin.id } });
  const generacion = await prisma.generacion.create({ data: { organizacionId: org.id, proyectoId: proyecto.id, parametros: {}, iniciadoPorId: admin.id } });
  return {
    orgId: org.id, adminId: admin.id, productorId: productor.id, clienteId: cliente.id, kitId: cliente.kit!.id, proyectoId: proyecto.id, cursoId: curso.id,
    pantallaId: documento.modulos[0].capsulas[0].pantallas[0].id, recursoId: recurso.id, exportacionId: exportacion.id, generacionId: generacion.id,
  };
}

async function ingresar(email: string) {
  const res = await request(servidor).post('/api/v1/auth/ingresar').send({ email, clave: CLAVE });
  return ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
}

type Metodo = 'get' | 'patch' | 'put' | 'delete' | 'post';
interface Caso { nombre: string; metodo: Metodo; ruta: (d: Datos) => string; cuerpo?: (d: Datos) => object; id: (d: Datos) => string; entidad: string }

/** Lectura, edición y borrado por id de cada recurso: proyecto, cliente, kit, curso, recurso, exportación (y generación y usuario). */
const MATRIZ: Caso[] = [
  { nombre: 'leer proyecto', metodo: 'get', ruta: (d) => `/proyectos/${d.proyectoId}`, id: (d) => d.proyectoId, entidad: 'Proyecto' },
  { nombre: 'editar proyecto', metodo: 'patch', ruta: (d) => `/proyectos/${d.proyectoId}`, cuerpo: () => ({ nombre: 'Ajeno' }), id: (d) => d.proyectoId, entidad: 'Proyecto' },
  { nombre: 'archivar proyecto', metodo: 'delete', ruta: (d) => `/proyectos/${d.proyectoId}`, id: (d) => d.proyectoId, entidad: 'Proyecto' },
  { nombre: 'leer el curso del proyecto', metodo: 'get', ruta: (d) => `/proyectos/${d.proyectoId}/curso`, id: (d) => d.proyectoId, entidad: 'Proyecto' },
  { nombre: 'leer cliente', metodo: 'get', ruta: (d) => `/clientes/${d.clienteId}`, id: (d) => d.clienteId, entidad: 'Cliente' },
  { nombre: 'editar cliente', metodo: 'patch', ruta: (d) => `/clientes/${d.clienteId}`, cuerpo: () => ({ nombre: 'Ajeno' }), id: (d) => d.clienteId, entidad: 'Cliente' },
  { nombre: 'leer kit', metodo: 'get', ruta: (d) => `/clientes/${d.clienteId}/kit`, id: (d) => d.clienteId, entidad: 'Cliente' },
  { nombre: 'borrar la propuesta de kit', metodo: 'delete', ruta: (d) => `/clientes/${d.clienteId}/kit/propuesta`, id: (d) => d.clienteId, entidad: 'Cliente' },
  { nombre: 'leer observaciones del curso', metodo: 'get', ruta: (d) => `/cursos/${d.cursoId}/observaciones`, id: (d) => d.cursoId, entidad: 'Curso' },
  { nombre: 'editar pantalla del curso', metodo: 'patch', ruta: (d) => `/cursos/${d.cursoId}/pantallas/${d.pantallaId}`, cuerpo: () => ({ version: 1, titulo: { es: 'Ajeno' } }), id: (d) => d.cursoId, entidad: 'Curso' },
  { nombre: 'leer recurso', metodo: 'get', ruta: (d) => `/recursos/${d.recursoId}`, id: (d) => d.recursoId, entidad: 'Recurso' },
  { nombre: 'leer exportación', metodo: 'get', ruta: (d) => `/exportaciones/${d.exportacionId}`, id: (d) => d.exportacionId, entidad: 'Exportacion' },
  { nombre: 'listar exportaciones del curso', metodo: 'get', ruta: (d) => `/cursos/${d.cursoId}/exportaciones`, id: (d) => d.cursoId, entidad: 'Curso' },
  { nombre: 'leer generación', metodo: 'get', ruta: (d) => `/generaciones/${d.generacionId}`, id: (d) => d.generacionId, entidad: 'Generacion' },
  { nombre: 'editar usuario', metodo: 'patch', ruta: (d) => `/usuarios/${d.productorId}`, cuerpo: () => ({ activo: false }), id: (d) => d.productorId, entidad: 'Usuario' },
];

const pedir = (c: Caso, d: Datos, cookie: string) => {
  const r = request(servidor)[c.metodo](`/api/v1${c.ruta(d)}`).set('Cookie', cookie);
  return c.cuerpo ? r.send(c.cuerpo(d)) : r;
};

/** Filas de auditoría de acceso cruzado de un usuario, esperando a que lleguen (se registran después de responder). */
async function auditoriaDe(usuarioId: string, entidadId: string, metodo: string, ruta: string) {
  let filas: Awaited<ReturnType<typeof prisma.auditoria.findMany>> = [];
  for (let i = 0; i < 50; i++) {
    filas = await prisma.auditoria.findMany({ where: { usuarioId, accion: ACCION_ACCESO_OTRA_ORGANIZACION, entidadId } });
    filas = filas.filter((f) => { const d = f.datos as { metodo?: string; ruta?: string } | null; return d?.metodo === metodo && d.ruta === ruta; });
    if (filas.length > 0) break;
    await new Promise((r) => setTimeout(r, 40));
  }
  return filas;
}

describe('ids de la ruta', () => {
  it('toma solo los UUID, sin repetir y en minúsculas', () => {
    expect(idsDeRuta({ proyectoId: 'AAAAAAAA-0000-4000-8000-000000000001', id: 'aaaaaaaa-0000-4000-8000-000000000001', etapa: 'estructura', version: '3' })).toEqual(['aaaaaaaa-0000-4000-8000-000000000001']);
    expect(idsDeRuta(undefined)).toEqual([]);
  });
});

describe.skipIf(!hayBase)('CP-139 · aislamiento entre organizaciones (HU-1701)', () => {
  beforeAll(async () => {
    A = await poblar('a');
    B = await poblar('b');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    servidor = app.getHttpServer();
    cookies.a = await ingresar(correo('admin-a'));
    cookies.b = await ingresar(correo('admin-b'));
  });

  afterAll(async () => {
    await app?.close();
    const usuarios = await prisma.usuario.findMany({ where: { email: { endsWith: `-${sufijo}@organizaciones.test` } }, select: { id: true } });
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await prisma.organizacion.deleteMany({ where: { id: { in: [A?.orgId, B?.orgId].filter(Boolean) } } });
  });

  it('la organización dueña lee sus propios recursos (los ids de la matriz existen)', async () => {
    for (const c of MATRIZ.filter((x) => x.metodo === 'get')) {
      const res = await pedir(c, B, cookies.b!);
      expect([c.nombre, res.status]).toEqual([c.nombre, 200]);
    }
  });

  for (const c of MATRIZ) {
    it(`${c.nombre} de otra organización: 404 y ACCESO_OTRA_ORGANIZACION en la auditoría de plataforma`, async () => {
      const res = await pedir(c, B, cookies.a!);
      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe('NO_ENCONTRADO');
      const filas = await auditoriaDe(A.adminId, c.id(B), c.metodo.toUpperCase(), `/api/v1${c.ruta(B)}`);
      expect(filas).toHaveLength(1);
      const [fila] = filas;
      expect(fila).toMatchObject({ organizacionId: null, usuarioId: A.adminId, entidad: c.entidad, entidadId: c.id(B) });
      expect(fila!.datos).toMatchObject({
        usuarioId: A.adminId, rol: 'ADMINISTRADOR', organizacionOrigen: A.orgId, organizacionPropietaria: B.orgId,
        metodo: c.metodo.toUpperCase(), ruta: `/api/v1${c.ruta(B)}`,
      });
      expect((fila!.datos as { recursos: { id: string }[] }).recursos.map((r) => r.id)).toContain(c.id(B));
    });
  }

  it('los recursos de la otra organización no cambian', async () => {
    expect((await prisma.proyecto.findUniqueOrThrow({ where: { id: B.proyectoId } })).nombre).toBe('Proyecto b');
    expect((await prisma.proyecto.findUniqueOrThrow({ where: { id: B.proyectoId } })).estado).not.toBe('ARCHIVADO');
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: B.clienteId } })).nombre).toBe('Cliente b');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: B.productorId } })).activo).toBe(true);
  });

  it('el 404 es igual al de un id que no existe, y ese no se audita', async () => {
    const ajeno = await request(servidor).get(`/api/v1/proyectos/${B.proyectoId}`).set('Cookie', cookies.a!);
    const inexistente = await request(servidor).get(`/api/v1/proyectos/${NO_EXISTE}`).set('Cookie', cookies.a!);
    expect(inexistente.status).toBe(404);
    expect(ajeno.body).toEqual(inexistente.body);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.auditoria.count({ where: { accion: ACCION_ACCESO_OTRA_ORGANIZACION, entidadId: NO_EXISTE } })).toBe(0);
  });

  it('un 404 dentro de la propia organización no es acceso cruzado', async () => {
    const res = await request(servidor).get(`/api/v1/clientes/${A.clienteId}/kit/propuesta`).set('Cookie', cookies.a!);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.auditoria.count({ where: { accion: ACCION_ACCESO_OTRA_ORGANIZACION, entidadId: A.clienteId } })).toBe(0);
  });

  it('la otra organización no ve la fila en su auditoría: queda solo en la de plataforma', async () => {
    expect(await prisma.auditoria.count({ where: { accion: ACCION_ACCESO_OTRA_ORGANIZACION, organizacionId: { in: [A.orgId, B.orgId] } } })).toBe(0);
    expect(await prisma.auditoria.count({ where: { accion: ACCION_ACCESO_OTRA_ORGANIZACION, usuarioId: A.adminId, organizacionId: null } })).toBeGreaterThanOrEqual(MATRIZ.length);
  });
});
