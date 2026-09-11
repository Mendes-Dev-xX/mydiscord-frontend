import { Component, effect, inject, PLATFORM_ID, signal } from '@angular/core'; // ADICIONE 'PLATFORM_ID'
import { isPlatformBrowser } from '@angular/common'; // ADICIONE ISSO
import { Socket } from '../../services/socket';
import { ToolsRoom } from '../tools-room/tools-room';
import { FormsModule } from '@angular/forms';
import { Rooms } from '../../models/rooms';
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
  volumeMicrofone = signal(100);
  reducaoDeRuido = signal(true);
  cancelamentoDeEco = signal(true);
  ganhoAutomatico = signal(false);
  filtroDeVoz = signal(false);
  intensidadeDoFiltro = signal(2);
  bloqueadorDeRuido = signal(false);
  limiteDeRuido = signal(3);
  configuracoesAbertas = signal(false);
  volumesDosAmigos = signal<Record<string, number>>({});
  private streamOriginalDoMicrofone?: MediaStream;
  private contextoDeAudio?: AudioContext;
  private ganhoDoMicrofone?: GainNode;
  private filtroPassaAlta?: BiquadFilterNode;
  private compressorDoMicrofone?: DynamicsCompressorNode;
  private bloqueadorDoMicrofone?: ScriptProcessorNode;
  private ganhoDoBloqueador = 0;
  joinRoom = false;
  chamadasAtivas: any[] = [];
  chamadasDeTela: any[] = [];
  telaCompartilhada?: MediaStream;
  compartilhandoTela = signal(false);
  telasRemotas = signal<{ socketId: string; stream: MediaStream }[]>([]);
  message = '';
  messages = signal<{ socketId: string; message: string }[]>([]);

  listRoom = signal<Rooms[]>([
    {id: "amor", name: 'Aqui amorzinho'}
  ])

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
      this.streamOriginalDoMicrofone = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: this.reducaoDeRuido(),
          echoCancellation: this.cancelamentoDeEco(),
          autoGainControl: this.ganhoAutomatico(),
        },
        video: false,
      });
      this.configurarVolumeDoMicrofone(this.streamOriginalDoMicrofone);

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

    this.socketService.localStream?.getTracks().forEach((track) => track.stop());
    this.streamOriginalDoMicrofone?.getTracks().forEach((track) => track.stop());
    this.streamOriginalDoMicrofone = undefined;
    this.contextoDeAudio?.close();
    this.contextoDeAudio = undefined;
    this.ganhoDoMicrofone = undefined;
    this.filtroPassaAlta = undefined;
    this.compressorDoMicrofone = undefined;
    this.bloqueadorDoMicrofone = undefined;
    this.ganhoDoBloqueador = 0;
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
    audioEl.volume = this.volumeDoAmigo(userId) / 100;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }

  sendMessage() {
    if (!this.message.trim()) return;

    this.socketService.sendMessage(this.message.trim());

    this.message = '';
  }

  alterarVolumeDoMicrofone(evento: Event) {
    const volume = Number((evento.target as HTMLInputElement).value);
    this.volumeMicrofone.set(volume);
    if (this.ganhoDoMicrofone) this.ganhoDoMicrofone.gain.value = volume / 100;
  }

  async alternarReducaoDeRuido(evento: Event) {
    const ativada = (evento.target as HTMLInputElement).checked;
    this.reducaoDeRuido.set(ativada);

    await this.aplicarConfiguracoesNativas();
  }

  async alternarCancelamentoDeEco(evento: Event) {
    this.cancelamentoDeEco.set((evento.target as HTMLInputElement).checked);
    await this.aplicarConfiguracoesNativas();
  }

  async alternarGanhoAutomatico(evento: Event) {
    this.ganhoAutomatico.set((evento.target as HTMLInputElement).checked);
    await this.aplicarConfiguracoesNativas();
  }

  alternarFiltroDeVoz(evento: Event) {
    this.filtroDeVoz.set((evento.target as HTMLInputElement).checked);
    this.atualizarFiltroDeVoz();
  }

  alterarIntensidadeDoFiltro(evento: Event) {
    this.intensidadeDoFiltro.set(Number((evento.target as HTMLInputElement).value));
    this.atualizarFiltroDeVoz();
  }

  alternarBloqueadorDeRuido(evento: Event) {
    this.bloqueadorDeRuido.set((evento.target as HTMLInputElement).checked);
  }

  alterarLimiteDeRuido(evento: Event) {
    this.limiteDeRuido.set(Number((evento.target as HTMLInputElement).value));
  }

  abrirConfiguracoesDeVoz() {
    this.configuracoesAbertas.set(true);
  }

  fecharConfiguracoesDeVoz() {
    this.configuracoesAbertas.set(false);
  }

  private async aplicarConfiguracoesNativas() {
    const track = this.streamOriginalDoMicrofone?.getAudioTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        noiseSuppression: this.reducaoDeRuido(),
        echoCancellation: this.cancelamentoDeEco(),
        autoGainControl: this.ganhoAutomatico(),
      });
    } catch (error) {
      console.log('O navegador não conseguiu alterar a redução de ruído.', error);
    }
  }

  alterarVolumeDoAmigo(socketId: string, evento: Event) {
    const volume = Number((evento.target as HTMLInputElement).value);
    this.volumesDosAmigos.update((volumes) => ({ ...volumes, [socketId]: volume }));

    const audio = document.getElementById(`audio-${socketId}`) as HTMLAudioElement | null;
    if (audio) audio.volume = volume / 100;
  }

  volumeDoAmigo(socketId: string) {
    return this.volumesDosAmigos()[socketId] ?? 100;
  }

  private configurarVolumeDoMicrofone(stream: MediaStream) {
    this.contextoDeAudio?.close();
    this.contextoDeAudio = new AudioContext();

    const fonte = this.contextoDeAudio.createMediaStreamSource(stream);
    this.ganhoDoMicrofone = this.contextoDeAudio.createGain();
    const destino = this.contextoDeAudio.createMediaStreamDestination();
    this.ganhoDoMicrofone.gain.value = this.volumeMicrofone() / 100;

    // O microfone é encaminhado sem processamento por blocos para evitar
    // distorção, chiado e o efeito de voz robotizada.
    fonte.connect(this.ganhoDoMicrofone).connect(destino);
    this.socketService.localStream = destino.stream;
  }

  private atualizarFiltroDeVoz() {
    if (!this.filtroPassaAlta || !this.compressorDoMicrofone) return;

    const intensidade = this.intensidadeDoFiltro();
    this.filtroPassaAlta.frequency.value = this.filtroDeVoz() ? 60 + intensidade * 40 : 20;
    this.compressorDoMicrofone.threshold.value = this.filtroDeVoz() ? -18 - intensidade * 3 : 0;
  }

  private processarBloqueadorDeRuido(evento: AudioProcessingEvent) {
    const entrada = evento.inputBuffer.getChannelData(0);
    const saida = evento.outputBuffer.getChannelData(0);
    const limite = 0.008 + this.limiteDeRuido() * 0.006;
    let energia = 0;

    for (const amostra of entrada) energia += amostra * amostra;
    const volume = Math.sqrt(energia / entrada.length);
    const ganhoAlvo = !this.bloqueadorDeRuido() || volume >= limite ? 1 : 0;
    const passo = ganhoAlvo > this.ganhoDoBloqueador ? 0.16 : 0.05;

    for (let indice = 0; indice < entrada.length; indice++) {
      this.ganhoDoBloqueador += (ganhoAlvo - this.ganhoDoBloqueador) * passo;
      saida[indice] = entrada[indice] * this.ganhoDoBloqueador;
    }
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
