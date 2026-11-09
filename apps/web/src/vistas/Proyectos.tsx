import { Cabecera } from '@aptio/ui';

/** Inicio de la herramienta. La lista de proyectos llega con M03 (S1); en el S0 muestra el estado vacío. */
export function Proyectos() {
  return (
    <>
      <Cabecera titulo="Proyectos" subtitulo="Cada proyecto es un SCORM, desde el material del cliente hasta el paquete." />
      <section className="tarjeta vacio">
        <h2>Aún no hay proyectos</h2>
        <p className="sec">
          Cuando se habilite la creación de proyectos, aquí verás cada SCORM con su cliente, su avance y su fecha de entrega.
        </p>
      </section>
    </>
  );
}
