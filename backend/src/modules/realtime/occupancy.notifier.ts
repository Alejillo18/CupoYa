// Puerto por el que los servicios avisan que la ocupación de un evento cambió.
// Es "dispara y olvida": quien avisa no espera ni depende de que llegue.
export interface OccupancyNotifier {
    eventChanged(eventId: string): void;
  }
  
  export const sinNotificacion: OccupancyNotifier = {
    eventChanged: () => undefined,
  };
  
  // El aviso es secundario: si falla, la operación de negocio ya hecha no se rompe.
  export function avisarCambio(notifier: OccupancyNotifier, eventId: string): void {
    try {
      notifier.eventChanged(eventId);
    } catch (err) {
      console.error('No se pudo avisar el cambio de ocupación:', err);
    }
  }