import { Component, inject, input, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventsService } from '../../core/events.service';

function fechaFutura(control: AbstractControl): ValidationErrors | null {
  const v = control.value as string;
  if (!v) return null;
  return new Date(v).getTime() > Date.now() ? null : { fechaPasada: true };
}

function aInputLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MENSAJES: Record<string, string> = {
  FECHA_PASADA: 'La fecha del evento debe ser futura.',
  CUPO_INVALIDO: 'El cupo debe ser un entero mayor a cero.',
  CUPO_MENOR_A_RESERVAS: 'El cupo no puede ser menor a los lugares ya reservados.',
  EVENTO_CANCELADO: 'No se puede editar un evento cancelado.',
  EVENTO_NO_ENCONTRADO: 'El evento no existe.',
  VALIDACION: 'Revisá los datos ingresados.',
};

@Component({
  selector: 'app-event-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './event-form.component.html',
  styleUrl: '../auth/auth.css',
})
export class EventFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly events = inject(EventsService);
  private readonly router = inject(Router);

  // Llega desde la ruta /eventos/:id/editar (withComponentInputBinding)
  readonly id = input<string | undefined>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
    venue: ['', [Validators.required, Validators.maxLength(160)]],
    startsAt: ['', [Validators.required, fechaFutura]],
    totalCapacity: [
      1,
      [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    ],
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    this.events.get(id).subscribe({
      next: (e) =>
        this.form.setValue({
          name: e.name,
          description: e.description,
          venue: e.venue,
          startsAt: aInputLocal(e.startsAt),
          totalCapacity: e.totalCapacity,
        }),
      error: (err) => this.error.set(this.mensaje(err)),
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const datos = {
      name: v.name.trim(),
      description: v.description.trim(),
      venue: v.venue.trim(),
      startsAt: new Date(v.startsAt),
      totalCapacity: Number(v.totalCapacity),
    };

    const id = this.id();
    const llamada = id ? this.events.update(id, datos) : this.events.create(datos);
    llamada.subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/eventos');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.mensaje(err));
      },
    });
  }

  private mensaje(err: any): string {
    const codigo = err?.error?.error?.code as string | undefined;
    return (codigo && MENSAJES[codigo]) || 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}