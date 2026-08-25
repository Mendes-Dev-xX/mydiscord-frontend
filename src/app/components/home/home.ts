import { Component } from '@angular/core';
import { Classroom } from '../classroom/classroom';

@Component({
  selector: 'app-home',
  imports: [Classroom],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {}
