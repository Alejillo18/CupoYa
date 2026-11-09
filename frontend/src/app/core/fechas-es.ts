import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';

// El adaptador nativo interpreta "05/12/2026" como 12 de mayo (formato de EE. UU.).
// Este lee día/mes/año y rechaza cualquier otra cosa en vez de adivinar.
@Injectable()
export class AdaptadorFechaAr extends NativeDateAdapter {
  override parse(value: any, parseFormat?: any): Date | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return super.parse(value, parseFormat);

    const texto = value.trim();
    if (texto === '') return null;

    const partes = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(texto);
    if (!partes) return this.invalid();

    const dia = Number(partes[1]);
    const mes = Number(partes[2]) - 1;
    const anio = Number(partes[3]);
    const fecha = new Date(anio, mes, dia);

    const existe =
      fecha.getFullYear() === anio && fecha.getMonth() === mes && fecha.getDate() === dia;
    return existe ? fecha : this.invalid();
  }
}

export const FORMATOS_FECHA: MatDateFormats = {
  parse: {
    dateInput: null,
    timeInput: null,
  },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    timeInput: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    timeOptionLabel: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    monthYearLabel: { year: 'numeric', month: 'long' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

@Injectable()
export class DatepickerIntlEs extends MatDatepickerIntl {
  override calendarLabel = 'Calendario';
  override openCalendarLabel = 'Abrir calendario';
  override closeCalendarLabel = 'Cerrar calendario';
  override prevMonthLabel = 'Mes anterior';
  override nextMonthLabel = 'Mes siguiente';
  override prevYearLabel = 'Año anterior';
  override nextYearLabel = 'Año siguiente';
  override prevMultiYearLabel = 'Anteriores 24 años';
  override nextMultiYearLabel = 'Siguientes 24 años';
  override switchToMonthViewLabel = 'Elegir fecha';
  override switchToMultiYearViewLabel = 'Elegir mes y año';

  override formatYearRange(start: string, end: string): string {
    return `${start} – ${end}`;
  }

  override formatYearRangeLabel(start: string, end: string): string {
    return `${start} a ${end}`;
  }
}

// Se declara en el componente que usa fechas (providers: [...proveedoresFechas]).
export const proveedoresFechas: Provider[] = [
  { provide: DateAdapter, useClass: AdaptadorFechaAr },
  { provide: MAT_DATE_FORMATS, useValue: FORMATOS_FECHA },
  { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  { provide: MatDatepickerIntl, useClass: DatepickerIntlEs },
];