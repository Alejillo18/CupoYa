import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { DatepickerIntlEs, FORMATOS_FECHA, proveedoresFechas } from './fechas-es';

const partes = (f: Date | null) => [f!.getFullYear(), f!.getMonth(), f!.getDate()];

describe('AdaptadorFechaAr', () => {
  let adaptador: DateAdapter<Date>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: proveedoresFechas });
    adaptador = TestBed.inject(DateAdapter);
  });

  it('interpreta lo escrito como día/mes/año', () => {
    expect(partes(adaptador.parse('05/12/2026', null))).toEqual([2026, 11, 5]);
  });

  it('acepta guiones, puntos y días o meses de un dígito', () => {
    expect(partes(adaptador.parse('5-1-2027', null))).toEqual([2027, 0, 5]);
    expect(partes(adaptador.parse('15.08.2026', null))).toEqual([2026, 7, 15]);
  });

  it('rechaza una fecha que no existe', () => {
    const resultado = adaptador.parse('31/02/2026', null);

    expect(adaptador.isValid(resultado!)).toBe(false);
  });

  it('rechaza texto que no es una fecha', () => {
    expect(adaptador.isValid(adaptador.parse('mañana', null)!)).toBe(false);
  });

  it('rechaza el formato ISO, que se corre un día según la zona horaria', () => {
    expect(adaptador.isValid(adaptador.parse('2026-12-05', null)!)).toBe(false);
  });

  it('un campo vacío no es un error: es "sin fecha"', () => {
    expect(adaptador.parse('', null)).toBeNull();
    expect(adaptador.parse('   ', null)).toBeNull();
  });

  it('muestra la fecha como dd/mm/aaaa', () => {
    const texto = adaptador.format(new Date(2026, 11, 5), FORMATOS_FECHA.display.dateInput);

    expect(texto).toBe('05/12/2026');
  });

  it('muestra la hora en formato de 24 horas', () => {
    const texto = adaptador.format(new Date(2026, 0, 1, 21, 5), FORMATOS_FECHA.display.timeInput);

    expect(texto).toBe('21:05');
  });

  it('usa los nombres de los meses en español', () => {
    expect(adaptador.getMonthNames('long')[11]).toBe('diciembre');
  });
});

describe('DatepickerIntlEs', () => {
  it('traduce las etiquetas del calendario', () => {
    const intl = new DatepickerIntlEs();

    expect(intl.openCalendarLabel).toBe('Abrir calendario');
    expect(intl.prevMonthLabel).toBe('Mes anterior');
    expect(intl.nextMonthLabel).toBe('Mes siguiente');
    expect(intl.switchToMultiYearViewLabel).toBe('Elegir mes y año');
  });

  it('formatea el rango de años en español', () => {
    const intl = new DatepickerIntlEs();

    expect(intl.formatYearRange('2026', '2049')).toBe('2026 – 2049');
    expect(intl.formatYearRangeLabel('2026', '2049')).toBe('2026 a 2049');
  });
});