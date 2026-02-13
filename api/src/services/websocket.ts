import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import logger from '../utils/logger';

// Client connection types
type ClientType = 'agent' | 'dashboard' | 'external';

interface ConnectedClient {
  ws: WebSocket;
  type: ClientType;
  agentId?: string;
  subscriptions: string[];
  connectedAt: Date;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const clientType = this.getClientType(req);

      logger.info('WebSocket client connected', {
        clientId,
        type: clientType,
        ip: req.socket.remoteAddress,
      });

      const client: ConnectedClient = {
        ws,
        type: clientType,
        subscriptions: [],
        connectedAt: new Date(),
      };

      this.clients.set(clientId, client);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connection',
        data: {
          clientId,
          message: 'Connected to GigClaw real-time updates',
          timestamp: new Date().toISOString(),
        },
      });

      ws.on('message', (data: string) => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
      });
    });

    // Start heartbeat
    this.startHeartbeat();

    logger.info('WebSocket server initialized on path /ws');
  }

  private handleMessage(clientId: string, data: string): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.channels || []);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.channels || []);
          break;

        case 'identify':
          this.handleIdentify(clientId, message.agentId);
          break;

        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          logger.warn('Unknown WebSocket message type', {
            clientId,
            type: message.type,
          });
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message', {
        clientId,
        error: (error as Error).message,
      });
    }
  }

  private handleSubscribe(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    channels.forEach((channel) => {
      if (!client.subscriptions.includes(channel)) {
        client.subscriptions.push(channel);
      }
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      data: { channels: client.subscriptions },
    });

    logger.debug('Client subscribed to channels', { clientId, channels });
  }

  private handleUnsubscribe(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions = client.subscriptions.filter(
      (sub) => !channels.includes(sub)
    );

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: { channels: client.subscriptions },
    });
  }

  private handleIdentify(clientId: string, agentId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.agentId = agentId;

    // Auto-subscribe to agent-specific channels
    this.handleSubscribe(clientId, [
      `agent:${agentId}`,
      'tasks:new',
      'bids:updates',
    ]);

    logger.info('Client identified as agent', { clientId, agentId });
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      logger.info('WebSocket client disconnected', {
        clientId,
        type: client.type,
        duration: Date.now() - client.connectedAt.getTime(),
      });
    }
    this.clients.delete(clientId);
  }

  // Public methods for broadcasting events

  broadcastTaskCreated(task: any): void {
    this.broadcast('tasks:new', {
      type: 'task_created',
      data: task,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastBidPlaced(taskId: string, bid: any): void {
    this.broadcast('bids:updates', {
      type: 'bid_placed',
      taskId,
      data: bid,
      timestamp: new Date().toISOString(),
    });

    // Also notify task poster
    this.broadcast(`task:${taskId}`, {
      type: 'new_bid',
      data: bid,
    });
  }

  broadcastBidAccepted(taskId: string, bid: any): void {
    this.broadcast('tasks:updates', {
      type: 'bid_accepted',
      taskId,
      data: bid,
      timestamp: new Date().toISOString(),
    });

    // Notify the winning agent
    if (bid.agentId) {
      this.broadcast(`agent:${bid.agentId}`, {
        type: 'bid_won',
        taskId,
        data: bid,
      });
    }
  }

  broadcastTaskCompleted(taskId: string, task: any): void {
    this.broadcast('tasks:updates', {
      type: 'task_completed',
      data: task,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastPaymentReleased(taskId: string, payment: any): void {
    this.broadcast('payments:updates', {
      type: 'payment_released',
      taskId,
      data: payment,
      timestamp: new Date().toISOString(),
    });

    // Notify agent
    if (payment.agentId) {
      this.broadcast(`agent:${payment.agentId}`, {
        type: 'payment_received',
        taskId,
        amount: payment.amount,
      });
    }
  }

  broadcastDisputeInitiated(dispute: any): void {
    this.broadcast('disputes:updates', {
      type: 'dispute_initiated',
      data: dispute,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastDisputeResolved(dispute: any): void {
    this.broadcast('disputes:updates', {
      type: 'dispute_resolved',
      data: dispute,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastStandup(standup: any): void {
    this.broadcast('standups:new', {
      type: 'standup_conducted',
      data: standup,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastVote(proposal: any): void {
    this.broadcast('voting:updates', {
      type: 'vote_cast',
      data: proposal,
      timestamp: new Date().toISOString(),
    });
  }

  // Send to specific agent
  sendToAgent(agentId: string, message: any): void {
    this.broadcast(`agent:${agentId}`, message);
  }

  private broadcast(channel: string, message: any): void {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (
        client.subscriptions.includes(channel) ||
        client.subscriptions.includes('all')
      ) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(messageStr);
        }
      }
    });
  }

  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(clientId, {
            type: 'heartbeat',
            timestamp: Date.now(),
          });
        }
      });
    }, 30000); // Every 30 seconds
  }

  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientType(req: any): ClientType {
    const userAgent = req.headers['user-agent'] || '';

    if (userAgent.includes('GigClaw-Agent')) {
      return 'agent';
    }
    if (userAgent.includes('GigClaw-Dashboard')) {
      return 'dashboard';
    }
    return 'external';
  }

  getStats(): {
    totalClients: number;
    agents: number;
    dashboards: number;
    external: number;
  } {
    let agents = 0;
    let dashboards = 0;
    let external = 0;

    this.clients.forEach((client) => {
      switch (client.type) {
        case 'agent':
          agents++;
          break;
        case 'dashboard':
          dashboards++;
          break;
        case 'external':
          external++;
          break;
      }
    });

    return {
      totalClients: this.clients.size,
      agents,
      dashboards,
      external,
    };
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });

    this.wss?.close();
    logger.info('WebSocket server shut down');
  }
}

export const wsService = new WebSocketService();
export default wsService;
