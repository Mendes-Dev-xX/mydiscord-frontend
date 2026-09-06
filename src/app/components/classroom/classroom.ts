import { Component, effect, inject, PLATFORM_ID, signal } from '@angular/core'; // ADICIONE 'PLATFORM_ID'
import { isPlatformBrowser } from '@angular/common'; // ADICIONE ISSO
import { Socket } from '../../services/socket';
import { ToolsRoom } from '../tools-room/tools-room';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-classroom',
  imports: [ToolsRoom, FormsModule],
  templateUrl: './classroom.html',
  styleUrl: './classroom.css',
})
export class Classroom {
  socketService = inject(Socket);
  platformId = inject(PLATFORM_ID); // Injeta o identificador de plataforma

  socketIds = signal<string[]>([]);
  socketId = '';
  joinRoom = false;
  chamadasAtivas: any[] = [];
  chamadasDeTela: any[] = [];
  telaCompartilhada?: MediaStream;
  compartilhandoTela = signal(false);
  telasRemotas = signal<{ socketId: string; stream: MediaStream }[]>([]);
  message = '';
  messages = signal<{ socketId: string; message: string }[]>([]);
  async entrarSala(room: string) {
    if (this.socketService.currentRoom() === room) {
      return;
    }

    if (this.socketService.currentRoom()) {
      this.sairDaSalaAtual();
    }

    // GURANÇA SSR: Só executa se for o navegador
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      this.socketService.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.socketService.joinRoom(room);
    } catch (err) {
      console.log('Erro ao acessar o microfone', err);
      alert('Você precisa permitir o microfone para entrar no canal de voz!');
    }
  }

  sairDaSalaAtual() {
    this.socketService.leaveRoom();
    this.finalizarMídia();
  }

  finalizarMídia() {
    // GURANÇA SSR: Se estiver no servidor, ignora o 'document' para não quebrar
    if (!isPlatformBrowser(this.platformId)) return;

    this.chamadasAtivas.forEach((call) => call.close());
    this.chamadasAtivas = [];
    this.pararCompartilhamentoDeTela();
    this.telasRemotas.set([]);

    if (this.socketService.localStream) {
      this.socketService.localStream.getTracks().forEach((track) => track.stop());
    }
    this.socketIds.set([]);

    const audios = document.querySelectorAll('audio');
    audios.forEach((audio) => audio.remove());
  }

  constructor() {
    // GURANÇA SSR: Só registra os listeners do Socket e PeerJS no navegador
    if (isPlatformBrowser(this.platformId)) {
      this.socketService.socket.on('connect', () => {
        this.socketId = this.socketService.socket.id ?? '';

        this.socketService.peer.on('call', (call) => {
          if (call.metadata?.type === 'screen-share') {
            call.answer();
            call.on('stream', (remoteStream) => {
              this.exibirTelaRemota(remoteStream, call.peer);
            });
            call.on('close', () => this.removerTelaRemota(call.peer));
            return;
          }

          call.answer(this.socketService.localStream);
          call.on('stream', (remoteStream) => {
            this.reproduzirAudioUsuario(remoteStream, call.peer);
          });
          this.chamadasAtivas.push(call);
        });
      });

      this.socketService.onUserJoined((socketId) => {
        if (!this.socketIds().includes(socketId) && socketId !== this.socketId) {
          this.socketIds.update((ids) => [...ids, socketId]);
          const call = this.socketService.peer.call(socketId, this.socketService.localStream);
          call.on('stream', (remoteStream) => {
            this.reproduzirAudioUsuario(remoteStream, socketId);
          });
          this.chamadasAtivas.push(call);

          if (this.telaCompartilhada) {
            this.compartilharTelaCom(socketId);
          }
        }
      });

      this.socketService.onUserLeft((socketId) => {
        this.socketIds.update((ids) => ids.filter((id) => id !== socketId));
        this.removerTelaRemota(socketId);
      });

      this.socketService.onReceiveMessage((data) => {
        console.log('Mensagem recebida: ', data);

        this.messages.update((messages) => [...messages, data]);
      });
    }

    // O effect monitora sinais, mantemos ele aqui, mas protegido por nossa checagem interna em finalizarMídia
    effect(() => {
      if (this.socketService.currentRoom() === null) {
        this.finalizarMídia();
      }
    });
  }

  reproduzirAudioUsuario(stream: MediaStream, userId: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    if (document.getElementById(`audio-${userId}`)) return;

    const audioEl = document.createElement('audio');
    audioEl.id = `audio-${userId}`;
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }

  sendMessage() {
    if (!this.message.trim()) return;

    this.socketService.sendMessage(this.message.trim());

    this.message = '';
  }

  async compartilharTela() {
    if (!isPlatformBrowser(this.platformId) || this.compartilhandoTela()) return;

    try {
      // O navegador abre o seletor nativo: tela inteira, janela ou aba.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: {
            ideal: 60,
            max: 60,
          },
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
        },
        audio: true,
      });

      this.telaCompartilhada = stream;
      this.compartilhandoTela.set(true);
      stream
        .getVideoTracks()[0]
        ?.addEventListener('ended', () => this.pararCompartilhamentoDeTela());

      this.socketIds().forEach((socketId) => this.compartilharTelaCom(socketId));
    } catch (error) {
      // Cancelar o seletor é uma ação normal e não precisa quebrar a sala.
      console.log('Compartilhamento de tela não iniciado.', error);
    }
  }

  pararCompartilhamentoDeTela() {
    this.chamadasDeTela.forEach((call) => call.close());
    this.chamadasDeTela = [];
    this.telaCompartilhada?.getTracks().forEach((track) => track.stop());
    this.telaCompartilhada = undefined;
    this.compartilhandoTela.set(false);
  }

  private compartilharTelaCom(socketId: string) {
    if (!this.telaCompartilhada || !this.socketService.peer) return;

    const call = this.socketService.peer.call(socketId, this.telaCompartilhada, {
      metadata: { type: 'screen-share' },
    });
    this.chamadasDeTela.push(call);
  }

  private exibirTelaRemota(stream: MediaStream, socketId: string) {
    this.telasRemotas.update((telas) => {
      const semTelaAnterior = telas.filter((tela) => tela.socketId !== socketId);
      return [...semTelaAnterior, { socketId, stream }];
    });
  }

  private removerTelaRemota(socketId: string) {
    this.telasRemotas.update((telas) => telas.filter((tela) => tela.socketId !== socketId));
  }

  entrarTelaCheia(video: HTMLVideoElement) {
  if (!isPlatformBrowser(this.platformId)) return;

  if (video.requestFullscreen) {
    video.requestFullscreen();
  }
}
}
