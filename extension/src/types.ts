/**
 * Contrato de datos que la extensión espera recibir.
 * Inicialmente se carga desde sampleData.ts; en el futuro
 * este objeto vendrá del análisis generado por IBM Bob.
 */

export type ModuleType = 'frontend' | 'backend' | 'database' | 'infrastructure' | 'other';

export interface Module {
  /** Nombre legible del módulo (usado también como ID en las relaciones). */
  name: string;
  /** Ruta relativa al workspace, e.g. "api/src/routes/". */
  path: string;
  /** Descripción breve para el desarrollador nuevo. */
  description: string;
  /** Categoría visual del módulo. */
  type: ModuleType;
}

export interface Relationship {
  /** name de un Module que origina la dependencia. */
  from: string;
  /** name de un Module que recibe la dependencia. */
  to: string;
  /** Descripción de qué comunica o por qué existe esta relación. */
  description: string;
}

export interface OnboardingData {
  /** Nombre del repositorio/proyecto. */
  projectName: string;
  /** Resumen orientado a un desarrollador que llega por primera vez. */
  summary: string;
  /** Lista de tecnologías detectadas en el repositorio. */
  technologies: string[];
  /** Módulos arquitectónicamente relevantes. */
  modules: Module[];
  /** Dependencias y comunicaciones entre módulos. */
  relationships: Relationship[];
}
