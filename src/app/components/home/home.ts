import { Component, inject } from '@angular/core';
import { Classroom } from '../classroom/classroom';
import { Socket } from '../../services/socket';

@Component({
  selector: 'app-home',
  imports: [Classroom],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {

 socketService = inject(Socket)

  modalMenu(){
    this.socketService.openMenuModel();
  }

  modalCreateRoom(){
    this.socketService.openCreateModal();
  }
}
