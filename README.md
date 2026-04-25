# Automation Client

App Electron para automação de digitação de códigos em sistemas de terceiros.

## Instalação e Uso

> ⚠️ **Execute sempre pelo Windows** (CMD ou PowerShell), não pelo WSL/Linux.

```bash
# Abra o CMD ou PowerShell do Windows, navegue até esta pasta:
cd C:\Users\Maciel Ribeiro\Desktop\Promoter\desktop-automation

# Instalar dependências
npm install

# Executar em modo desenvolvimento
npm start

# Gerar instalador Windows (.exe)
npm run build
```

O instalador será gerado em `dist/`.

## Como funciona

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
