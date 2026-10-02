import { createServer, type Server, type Socket } from 'node:net';

export interface CapturedMail {
  from: string;
  to: string[];
  data: string;
}

/** Just enough of an SMTP server for nodemailer to deliver to: it records what it is sent. */
export async function fakeSmtp(): Promise<{
  url: string;
  mails: CapturedMail[];
  close: () => Promise<void>;
}> {
  const mails: CapturedMail[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let mail: CapturedMail = { from: '', to: [], data: '' };
    let reading = false;
    let buffer = '';
    socket.write('220 fake.smtp ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (reading) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          mail.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          mails.push(mail);
          mail = { from: '', to: [], data: '' };
          reading = false;
          socket.write('250 queued\r\n');
          continue;
        }
        const line = buffer.indexOf('\r\n');
        if (line < 0) return;
        const command = buffer.slice(0, line);
        buffer = buffer.slice(line + 2);
        const upper = command.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) socket.write('250 fake.smtp\r\n');
        else if (upper.startsWith('MAIL FROM')) {
          mail.from = command.slice(10).replace(/[<>]/g, '').trim();
          socket.write('250 ok\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          mail.to.push(command.slice(8).replace(/[<>]/g, '').trim());
          socket.write('250 ok\r\n');
        } else if (upper === 'DATA') {
          reading = true;
          socket.write('354 go ahead\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `smtp://127.0.0.1:${port}`,
    mails,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
