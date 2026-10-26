import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: '../auth/auth.css',
})
export class HomeComponent {
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
}