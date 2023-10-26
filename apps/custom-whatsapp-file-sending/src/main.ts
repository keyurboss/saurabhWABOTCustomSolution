import * as BAIL from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as pin from 'pino';
import { readFile, utils } from 'xlsx';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
const AnyNonNumbers = /\D/g;
async function connectToWhatsApp() {
  const intputFileName = join(__dirname, './assets/data.csv');
  const WorkSBook = readFile(intputFileName);
  // workbook.Sheets[0].
  const outPutFileName = join(__dirname, 'assets', 'output.csv');
  const readedXlsxFile = utils.sheet_to_json<{
    number: string;
    filename: string;
  }>(WorkSBook.Sheets[WorkSBook.SheetNames[0]], {
    header: ['number', 'filename'],
    blankrows: false,
    raw: true,
    rawNumbers: true,
  });
  const { state, saveCreds } = await BAIL.useMultiFileAuthState('auth');
  const sock = BAIL.makeWASocket({
    auth: state,
    logger: pin.pino({
      level: 'warn',
    }),
    // logger: pin({ level: 'debug' }),
    // can provide additional config here
    printQRInTerminal: true,
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    console.log(connection);
    console.log(lastDisconnect);

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        BAIL.DisconnectReason.loggedOut;
      console.log(
        'connection closed due to ',
        lastDisconnect.error,
        ', reconnecting ',
        shouldReconnect,
      );
      // reconnect if not logged out
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('opened connection');
      AfterConnection();
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    // console.log('replying to', m.messages[0].key.remoteJid);
  });
  function AddOutPutFile(s: string) {
    writeFileSync(outPutFileName, s, {
      flag: 'a',
    });
  }
  async function AfterConnection() {
    // if (!existsSync(outPutFileName)) {
      writeFileSync(outPutFileName, '');
    // }
    for (const iterator of readedXlsxFile) {
      iterator.number = iterator.number
        .toString()
        .replace(AnyNonNumbers, '')
        .trim();
      iterator.filename = iterator.filename.trim();
      iterator.filename = join(
        __dirname,
        'assets',
        'files',
        `${iterator.filename}.pdf`,
      );
      let appendString = `${iterator.number},${iterator.filename}`;
      if (iterator.number.length !== 12 || !iterator.number.startsWith('91')) {
        appendString = `${appendString},false,Please Check Number Is Invalid\n`;
        AddOutPutFile(appendString);
        continue;
      }
      if (!existsSync(iterator.filename)) {
        appendString = `${appendString},false,File Not Found ${iterator.filename}\n`;
        AddOutPutFile(appendString);
        continue;
      }
      const [result] = await sock.onWhatsApp(iterator.number);
      if (result.exists) {
        console.log(
          `${iterator.number} exists on WhatsApp, as jid: ${result.jid}`,
        );
      } else {
        appendString = `${appendString},false,Number ${iterator.number} Not Found On Whatsapp\n`;
        AddOutPutFile(appendString);
        continue;
      }
      await sock
        .sendMessage('917016879936@s.whatsapp.net', {
          text: `${iterator.number}   ${iterator.filename}`,
        })
        .then((m) => {
          console.log(JSON.stringify(m, undefined, 2));
        });

        appendString = `${appendString},true\n`;
        AddOutPutFile(appendString);
    }
    process.exit(1);
  }
}
// run in main file
connectToWhatsApp();
