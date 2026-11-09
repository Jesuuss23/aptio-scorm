import { z } from 'zod';

// Validación de cada pantalla interactiva (HU-0406)
export const PantallaSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int().positive(),
  titulo: z.string().min(1),
  textoPantalla: z.string().max(250),
  narracionVoz: z.string().min(1),
  disposicion: z.enum(['TITULO_TEXTO', 'IDEA_ILUSTRACION', 'ACTIVIDAD', 'VIDEO']),
  aprobada: z.boolean().default(false),
});

// Validación de la cápsula SCORM completa (REQ-101)
export const CapsulaSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1),
  idioma: z.enum(['ES', 'EN']).default('ES'),
  version: z.string().default('0.2.0'),
  pantallas: z.array(PantallaSchema),
});

// Tipos TypeScript inferidos para todo el monorepo
export type Pantalla = z.infer<typeof PantallaSchema>;
export type Capsula = z.infer<typeof CapsulaSchema>;