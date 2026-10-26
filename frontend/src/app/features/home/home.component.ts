import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatCardModule, MatButtonModule],
  templateUrl: './home.component.html',
  styleUrl: '../../shared/pagina.css',
})
export class HomeComponent {
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
}