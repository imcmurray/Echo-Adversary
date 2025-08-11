import express from 'express';
import { WebSocketServer } from 'ws';
import { sttProcess } from './services/stt';
import { debateReply } from './services/llm';
import { tts } from './services/tts';
import { scoreRound } from './services/scoring';

const app = express();
const server = app.listen(8080, () => console.log('Server running'));
const wss = new WebSocketServer({ server, path: '/ws/match' });

wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    // Handle audio chunks and control messages here
    // Example: run STT → LLM → TTS → score
  });
});
