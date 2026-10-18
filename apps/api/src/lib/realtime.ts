import type { Server } from 'socket.io';

let io: Server | null = null;

export function setIo(server: Server | null) {
  io = server;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown) {
  io?.to(`conv:${conversationId}`).emit(event, payload);
}
