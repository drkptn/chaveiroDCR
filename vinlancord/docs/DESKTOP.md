# App desktop e instalador

O app desktop é o cliente web empacotado com **Electron 45** (Chromium), escolhido em vez do Tauri porque:

- o WebRTC é exatamente o do Chrome (mesmos codecs, aceleração por hardware e estabilidade) em todos os sistemas — no Tauri ele dependeria do WebView do sistema (WebKitGTK no Linux tem WebRTC limitado);
- permite um **seletor próprio de telas e janelas** e **captura do áudio do sistema** no Windows (`loopback`);
- integra bandeja, atalhos globais, notificações, badge, início automático e atualização automática.

## Gerar o instalador do Windows

### Opção A — num PC com Windows (mais simples)

1. Instale o [Node.js 22](https://nodejs.org) e o [Git](https://git-scm.com).
2. No PowerShell:

```powershell
git clone <seu-repositório>
cd chaveiroDCR\vinlancord
npm ci
$env:VINLANCORD_SERVER_URL = "https://vinlancord.seudominio.com"
npm run dist:win
```

3. O instalador fica em `apps\desktop\release\Vinlancord-Setup-1.0.0.exe`.

### Opção B — GitHub Actions

O workflow `.github/workflows/vinlancord.yml` roda todos os testes e gera o instalador num Windows. Em **Settings → Secrets and variables → Actions → Variables**, crie `VINLANCORD_SERVER_URL` com o endereço do seu servidor, ou rode manualmente (**Actions → Vinlancord → Run workflow**) informando o endereço. Baixe o artefato **Vinlancord-Windows** ao final.

### Opção C — no Linux

Precisa do Wine 64 e 32 bits (`dpkg --add-architecture i386 && apt install wine64 wine32:i386`). Depois `npm run dist:win`. Foi assim que o instalador foi gerado durante o desenvolvimento.

## O que o instalador faz

- Instalação por usuário (sem pedir administrador), com opção de escolher a pasta.
- Atalho na **área de trabalho** e no **menu Iniciar**, ícone próprio, nome “Vinlancord”.
- Registra links `vinlancord://` (ex.: `vinlancord://invite/aBcD1234`).
- Abre o app ao final; desinstalador incluso (preserva seus dados/login).

No app: *Configurações → Windows e desktop* → **Iniciar com o Windows** (abre minimizado na bandeja), **minimizar para a bandeja ao fechar** e **aceleração por hardware**.

## Endereço do servidor

O `VINLANCORD_SERVER_URL` vira o servidor padrão do app. Mesmo assim, a tela de login tem “Servidor: … alterar”, então o mesmo instalador funciona com qualquer servidor Vinlancord.

## Assinatura de código (recomendado)

Sem assinatura, o Windows SmartScreen mostra “O Windows protegeu o computador” na primeira execução (clique em *Mais informações → Executar assim mesmo*). Para evitar, compre um certificado de assinatura de código (OV/EV) e defina no ambiente de build:

```
CSC_LINK=caminho-ou-base64-do-certificado.pfx
CSC_KEY_PASSWORD=senha
```

No GitHub Actions, configure-os como *secrets* com os mesmos nomes.

## Atualização automática

O app usa `electron-updater` e **só procura atualizações quando um feed está configurado** (assim nunca baixa nada de origem desconhecida). Para ativar:

1. Em `apps/desktop/electron-builder.yml`, troque `publish: null` por:

   ```yaml
   publish:
     provider: generic
     url: https://downloads.seudominio.com/vinlancord/
   ```

2. Aumente a versão em `apps/desktop/package.json`, gere o instalador e publique no endereço acima o `.exe`, o `.exe.blockmap` e o `latest.yml` (HTTPS).
3. Os apps instalados verificam a cada 6 horas (e em *Windows e desktop → Procurar*), baixam em segundo plano, conferem o hash SHA-512 do `latest.yml` e instalam ao reiniciar. Com assinatura de código, o updater também valida o publicador.

## Linux e macOS (preparados)

`npm run dist:linux -w @vinlancord/desktop` (AppImage e .deb) e `npm run dist:mac -w @vinlancord/desktop` (dmg, precisa de um Mac). O código já trata Wayland (PipeWire), permissões de câmera/microfone do macOS e badge. Áudio do sistema no compartilhamento de tela é exclusivo do Windows por enquanto.
