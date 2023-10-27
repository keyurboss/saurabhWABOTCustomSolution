import { Boom } from '@hapi/boom';
import * as BAIL from '@whiskeysockets/baileys';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as pin from 'pino';
import { readFile, utils } from 'xlsx';
const AnyNonNumbers = /\D/g;



const Message = `We're asking for a little favor. 
Let's savor the moments together and put our phones away. 
Meet and mingle with family & friends and be present with us as we celebrate.

Let the celebrations begin!

*❤️With love❤️*,
*Aditi & Jay*👫`
async function connectToWhatsApp() {
  const intputFileName = join(__dirname, './assets/data.csv');
  const WorkSBook = readFile(intputFileName);
  // workbook.Sheets[0].
  const outPutFileName = join(__dirname, 'assets', 'output.csv');
  const readedXlsxFile = utils.sheet_to_json<{
    number: string;
    orignalName: string;
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
    console.log('replying to', m.messages[0].key.remoteJid);
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
    await createWaiting(1);
    for (const iterator of readedXlsxFile) {
      iterator.number = iterator.number
        .toString()
        .replace(AnyNonNumbers, '')
        .trim();
      iterator.orignalName = iterator.filename.trim();
      iterator.filename = join(
        __dirname,
        'assets',
        'files',
        `${iterator.orignalName}.pdf`,
      );
      let appendString = `${iterator.number},${iterator.orignalName}`;
      if (iterator.number.length !== 12 || !iterator.number.startsWith('91')) {
        appendString = `${appendString},false,Please Check Number Is Invalid\n`;
        AddOutPutFile(appendString);
        continue;
      }
      if (!existsSync(iterator.filename)) {
        appendString = `${appendString},false,File Not Found ${iterator.orignalName}\n`;
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
        .sendMessage(`${iterator.number}@s.whatsapp.net`, {
          document: {
            url: iterator.filename,
          },
          fileName: iterator.orignalName.endsWith('.pdf')
            ? iterator.orignalName
            : `${iterator.orignalName}.pdf`,
          caption: Message,
          footer: iterator.number,
          mimetype: 'application/pdf',
        })
        .then(() => {
          appendString = `${appendString},true\n`;
          AddOutPutFile(appendString);
          // console.log(JSON.stringify(m.message, undefined, 2));
        });
      console.log(appendString);
      await createWaiting(1);
    }
    await createWaiting(5);
    process.exit(1);
  }
}
// run in main file
connectToWhatsApp();

function createWaiting(waitInSecond: number) {
  return new Promise((res) => {
    setTimeout(res, waitInSecond * 1000);
  });
}
