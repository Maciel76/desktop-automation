# Automation Client

App Electron para automação de digitação de códigos em sistemas de terceiros.

> **Não requer instalação do Node.js** — o `.exe` inclui tudo embutido.

## Download

Baixe a versão mais recente em **[Releases](../../releases/latest)**.

| Arquivo | Descrição |
|---------|-----------|
| `Automation.Client.Setup.X.X.X.exe` | Instalador (recomendado) |
| `Automation.Client.X.X.X.exe` | Portable (sem instalação) |

## ⚠️ Aviso do Windows ao abrir o .exe

O Windows pode mostrar um aviso de segurança ("O aplicativo não é reconhecido") porque o arquivo não possui assinatura digital paga. Isso é normal para softwares internos.

**Como contornar:**

1. Clique em **"Mais informações"** na tela azul do Windows Defender SmartScreen
2. Clique em **"Executar mesmo assim"**

Ou: clique com o botão direito no `.exe` → **Propriedades** → marque **"Desbloquear"** → OK

## Instalação e Uso

1. O app inicia um servidor WebSocket local na porta configurada (padrão: **9099**)
2. Envie mensagens no formato `{ "codigo": "123456" }` para o WebSocket
3. O app automatiza: move o mouse, clica, limpa o campo, digita o código e pressiona a tecla configurada

## Configurações

As configurações ficam salvas em `%APPDATA%/promoter-automation-client/config.json`.

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| wsPort | 9099 | Porta do servidor WebSocket |
| mouseX | 500 | Coordenada X para clicar |
| mouseY | 300 | Coordenada Y para clicar |
| clickDelay | 200ms | Delay após clicar |
| clearDelay | 100ms | Delay após limpar campo |
| typeDelay | 200ms | Delay após digitar |
| keyAfterType | F5 | Tecla pressionada após digitar |

## Requisitos

- Windows 10 ou superior
- Node.js 18+
- PowerShell 5+ (incluído no Windows)
