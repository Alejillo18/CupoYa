import { Injectable, inject } from '@angular/core';
import { ConfigService } from './config.service';

const GIS_URL = 'https://accounts.google.com/gsi/client';

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly config = inject(ConfigService);
  private scriptCargado: Promise<void> | null = null;

  async renderButton(el: HTMLElement, onToken: (idToken: string) => void): Promise<boolean> {
    const clientId = this.config.googleClientId();
    if (!clientId) return false;

    try {
      await this.cargarScript();
    } catch {
      return false;
    }

    const gis = (window as any).google?.accounts?.id;
    if (!gis) return false;

    gis.initialize({
      client_id: clientId,
      callback: (resp: { credential?: string }) => {
        if (resp?.credential) onToken(resp.credential);
      },
    });
    gis.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', width: 280 });
    return true;
  }

  private cargarScript(): Promise<void> {
    if ((window as any).google?.accounts?.id) return Promise.resolve();
    if (!this.scriptCargado) {
      this.scriptCargado = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          this.scriptCargado = null;
          reject(new Error('No se pudo cargar Google'));
        };
        document.head.appendChild(s);
      });
    }
    return this.scriptCargado;
  }
}