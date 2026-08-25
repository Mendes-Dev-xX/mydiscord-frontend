import { Component, inject } from '@angular/core';
import { Socket } from '../../services/socket';

@Component({
  selector: 'app-tools-room',
  imports: [],
  templateUrl: './tools-room.html',
  styleUrl: './tools-room.css',
})
export class ToolsRoom {
  socketService = inject(Socket);

  disconnect(){
    this.socketService.leaveRoom();
  }


}
