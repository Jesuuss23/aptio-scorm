import express from 'express';
import cors from 'cors';
import { prisma } from '@aptio/db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CP-001: Verificación de salud
app.get('/api/v1/salud', (req, res) => {
  res.status(200).json({
    estado: 'ok',
    servicio: 'Aptio SCORM API',
    fecha: new Date().toISOString()
  });
});

// Prueba de lectura multi-tenant
app.get('/api/v1/organizaciones', async (req, res) => {
  try {
    const orgs = await prisma.organizacion.findMany({
      include: {
        usuarios: { select: { id: true, nombre: true, email: true, rol: true } },
        clientes: { select: { id: true, nombre: true } },
        proyectos: { select: { id: true, nombre: true } }
      }
    });
    res.status(200).json(orgs);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`);
});