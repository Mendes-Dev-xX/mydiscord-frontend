import { Injectable, signal } from '@angular/core';
import { io } from 'socket.io-client';
import { Peer } from 'peerjs';
import { BehaviorSubject } from 'rxjs';

const socketServerUrl = 'https://backend-t4yi.onrender.com';
@Injectable({ providedIn: 'root' })
export class Socket {

  socket = io(socketServerUrl);
  currentRoom = signal<string | null>(null);
  peer!: Peer;
  localStream!: MediaStream;
  peerPronto = new BehaviorSubject<boolean>(false);
  isVisible = signal<boolean>(false);
  isVisibleCreateRoom = signal<boolean>(false);

  constructor() {
    this.socket.on('connect', () => {
      const myId = this.socket.id;
      if (!myId) return;

      this.peer = new Peer(myId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
      });

      this.peer.on('open', (id) => {
        console.log('PeerJS registrado com sucesso no ID:', id);
        this.peerPronto.next(true);
      });
    });
  }

  joinRoom(room: string) {
    this.currentRoom.set(room);
    this.socket.emit('join-room', room);
  }

  getSocketId() {
    return this.socket.id;
  }

  leaveRoom() {
    const roomToLeave = this.currentRoom();
    if (roomToLeave) {
      this.socket.emit('leave-room', roomToLeave);
      this.currentRoom.set(null);
    }
  }

  onUserJoined(callback: (socketId: string) => void) {
    this.socket.on('user-joined', callback);
  }

  onUserLeft(callback: (socketId: string) => void) {
    this.socket.on('user-left', callback);
  }

  sendMessage(message: string) {
    this.socket.emit('send-message', message);
  }

  onReceiveMessage(callback: (data: { socketId: string; message: string }) => void) {
    this.socket.on('receive-message', callback);
  }

  openMenuModel(){
      this.isVisible.update(valueAtually => !valueAtually)
      console.log(this.isVisible())
}
  openCreateModal(){
      this.isVisibleCreateRoom.update(valueAtually => !valueAtually)
      console.log(this.isVisibleCreateRoom())
}
}
