import { Component } from '@angular/core';
import { Cursor } from './components/cursor/cursor';
import { Home } from './components/home/home';
import { Nav } from './components/nav/nav';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [Home, Nav, Cursor],
})
export class App {}
