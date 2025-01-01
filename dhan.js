require('dotenv').config();
const WebSocket = require('ws');
const struct = require('bufferpack');
const { DateTime } = require('luxon');

// Constants
const marketFeedWss = 'wss://api-feed.dhan.co';
const IDX = 0;
const NSE = 1;
const NSE_FNO = 2;
const NSE_CURR = 3;
const BSE = 4;
const MCX = 5;
const BSE_CURR = 7;
const BSE_FNO = 8;

const Ticker = 15;
const Quote = 17;
const Depth = 19;
const Full = 21;

class DhanFeed {
  constructor(clientId, accessToken, instruments, version = 'v1') {
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.instruments = instruments;
    this.ws = null;
    this.version = version;
    this.isAuthorized = false;
    this.onTicks = null;
  }

  // Run WebSocket Connection
  runForever() {
    this.connect().then(() => {
      console.log('Connected to WebSocket');
    }).catch((err) => {
      console.error('Connection Error:', err);
    });
  }

  // Connect to WebSocket
  async connect() {
    let url = marketFeedWss;
    if (this.version === 'v2') {
      url = `${marketFeedWss}?version=2&token=${this.accessToken}&clientId=${this.clientId}&authType=2`;
    }

    this.ws = new WebSocket(url);

    this.ws.on('open', async () => {
      console.log('WebSocket Opened');
      await this.authorize();
      await this.subscribeInstruments();
    });

    this.ws.on('message', (data) => {
      console.log('Received Data:', data);
      this.processData(data);
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket Error:', err);
    });

    this.ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

  }

  
  async authorize() {
    if (this.version !== 'v1') {
      console.log('Authorization not needed for this version.');
      this.isAuthorized = true;
      return;
    }
  
    try {
      console.log('Authorizing...');
      
      if (!this.accessToken || !this.clientId) {
        throw new Error('Access token or Client ID is invalid');
      }
  
      // Log Access Token and Client ID
      console.log('Access Token:', this.accessToken);
      console.log('Client ID:', this.clientId);
  
      const apiAccessToken = Buffer.from(this.accessToken, 'utf-8');
      const paddedAccessToken = this.padWithZeros(apiAccessToken, 500);
      const authenticationType = Buffer.from('2P');
  
      console.log('Padded Access Token Length:', paddedAccessToken.length);
      console.log('Authentication Type Buffer:', authenticationType);
  
      const payload = Buffer.concat([paddedAccessToken, authenticationType]);
      console.log('Payload Length:', payload.length);
  
      const feedRequestCode = 11;
      const messageLength = 83 + paddedAccessToken.length + authenticationType.length;
  
      const clientIdBuffer = Buffer.from(this.clientId, 'utf-8');
      const paddedClientId = this.padWithZeros(clientIdBuffer, 30);
  
      console.log('Padded Client ID Length:', paddedClientId.length);
  
      const dhanAuth = Buffer.alloc(50); // Allocate 50 bytes for dhanAuth
      console.log('DhanAuth Buffer Length:', dhanAuth.length);
  
      // Debugging the packing process:
      try {
        const header = struct.pack('<bH30s50s', feedRequestCode, messageLength, paddedClientId, dhanAuth);
        console.log('Header Packed Successfully:', header);
  
        const authorizationPacket = Buffer.concat([header, payload]);
        console.log('Authorization Packet Length:', authorizationPacket.length);
  
        await this.ws.send(authorizationPacket);
        this.isAuthorized = true;
        console.log('Authorization successful!');
      } catch (err) {
        console.error('Error while packing struct:', err);
      }
    } catch (err) {
      console.error(`Authorization failed: ${err}`);
      this.isAuthorized = false;
    }
  }
  
  

  
  padWithZeros(data, length) {
    const buffer = Buffer.alloc(length);
    data.copy(buffer);
    return buffer;
  }

  // Process Data based on type
  processData(data) {
    const firstByte = struct.unpack('<B', data.slice(0, 1))[0];

    switch (firstByte) {
      case 2:
        return this.processTicker(data);
      case 3:
        return this.processMarketDepth(data);
      case 4:
        return this.processQuote(data);
      case 5:
        return this.processOi(data);
      case 6:
        return this.processPrevClose(data);
      case 7:
        return this.processStatus(data);
      case 8:
        return this.processFull(data);
      case 50:
        return this.serverDisconnection(data);
      default:
        console.log('Unknown data type');
    }
  }

  // Process Ticker Data
  processTicker(data) {
    const unpackTicker = struct.unpack('<BHBIfI', data.slice(0, 16));
    return {
      type: 'Ticker Data',
      exchangeSegment: unpackTicker[2],
      securityId: unpackTicker[3],
      LTP: unpackTicker[4].toFixed(2),
      LTT: this.utcTime(unpackTicker[5]),
    };
  }

  // Process Market Depth Data
  processMarketDepth(data) {
    const marketData = struct.unpack('<BHBIf100s', data.slice(0, 112));
    const depthBinary = marketData[5];
    const depth = [];
    const packetFormat = '<IIHHff';
    const packetSize = struct.calcsize(packetFormat);

    for (let i = 0; i < 5; i++) {
      const startIdx = i * packetSize;
      const endIdx = startIdx + packetSize;
      const currentPacket = struct.unpack(packetFormat, depthBinary.slice(startIdx, endIdx));
      depth.push({
        bidQuantity: currentPacket[0],
        askQuantity: currentPacket[1],
        bidOrders: currentPacket[2],
        askOrders: currentPacket[3],
        bidPrice: currentPacket[4].toFixed(2),
        askPrice: currentPacket[5].toFixed(2),
      });
    }

    return {
      type: 'Market Depth',
      exchangeSegment: marketData[2],
      securityId: marketData[3],
      LTP: marketData[4],
      depth,
    };
  }

  // Process Quote Data
  processQuote(data) {
    const unpackQuote = struct.unpack('<BHBIfHIfIIIffff', data.slice(0, 50));
    return {
      type: 'Quote Data',
      exchangeSegment: unpackQuote[2],
      securityId: unpackQuote[3],
      LTP: unpackQuote[4].toFixed(2),
      LTQ: unpackQuote[5],
      LTT: this.utcTime(unpackQuote[6]),
      avgPrice: unpackQuote[7].toFixed(2),
      volume: unpackQuote[8],
      totalSellQuantity: unpackQuote[9],
      totalBuyQuantity: unpackQuote[10],
      open: unpackQuote[11].toFixed(2),
      close: unpackQuote[12].toFixed(2),
      high: unpackQuote[13].toFixed(2),
      low: unpackQuote[14].toFixed(2),
    };
  }

  // Process OI Data
  processOi(data) {
    const unpackOi = struct.unpack('<BHBII', data.slice(0, 12));
    return {
      type: 'OI Data',
      exchangeSegment: unpackOi[2],
      securityId: unpackOi[3],
      OI: unpackOi[4],
    };
  }

  // Process Previous Close Data
  processPrevClose(data) {
    const unpackPrevClose = struct.unpack('<BHBIfI', data.slice(0, 16));
    return {
      type: 'Previous Close',
      exchangeSegment: unpackPrevClose[2],
      securityId: unpackPrevClose[3],
      prevClose: unpackPrevClose[4].toFixed(2),
      prevOI: unpackPrevClose[5],
    };
  }

  // Process Market Status
  processStatus(data) {
    const unpackStatus = struct.unpack('<BHBI', data.slice(0, 8));
    return unpackStatus[4] === 1 ? 'Markets Open' : 'Markets Closed';
  }

  // Process Full Data
  processFull(data) {
    const unpackFull = struct.unpack('<BHBIfHIfIIIIIIffff100s', data.slice(0, 162));
    const depthBinary = unpackFull[18];
    const depth = [];
    const packetFormat = '<IIHHff';
    const packetSize = struct.calcsize(packetFormat);

    for (let i = 0; i < 5; i++) {
      const startIdx = i * packetSize;
      const endIdx = startIdx + packetSize;
      const currentPacket = struct.unpack(packetFormat, depthBinary.slice(startIdx, endIdx));
      depth.push({
        bidQuantity: currentPacket[0],
        askQuantity: currentPacket[1],
        bidOrders: currentPacket[2],
        askOrders: currentPacket[3],
        bidPrice: currentPacket[4].toFixed(2),
        askPrice: currentPacket[5].toFixed(2),
      });
    }

    return {
      type: 'Full Data',
      exchangeSegment: unpackFull[2],
      securityId: unpackFull[3],
      LTP: unpackFull[4].toFixed(2),
      LTQ: unpackFull[5],
      LTT: this.utcTime(unpackFull[6]),
      avgPrice: unpackFull[7].toFixed(2),
      volume: unpackFull[8],
      totalSellQuantity: unpackFull[9],
      totalBuyQuantity: unpackFull[10],
      OI: unpackFull[11],
      oiDayHigh: unpackFull[12],
      oiDayLow: unpackFull[13],
      open: unpackFull[14].toFixed(2),
      close: unpackFull[15].toFixed(2),
      high: unpackFull[16].toFixed(2),
      low: unpackFull[17].toFixed(2),
      depth,
    };
  }

  // Handle Server Disconnection
  serverDisconnection(data) {
    const disconnectionPacket = struct.unpack('<BHBIH', data.slice(0, 10));
    switch (disconnectionPacket[4]) {
      case 805:
        console.log("Disconnected: No. of active websocket connections exceeded");
        break;
      case 806:
        console.log("Disconnected: Subscribe to Data APIs to continue");
        break;
      case 807:
        console.log("Disconnected: Access Token is expired");
        break;
      case 808:
        console.log("Disconnected: Invalid Client ID");
        break;
      case 809:
        console.log("Disconnected: Authentication Failed");
        break;
      default:
        console.log("Disconnected: Unknown error");
    }
  }

  // Convert to UTC Time
  utcTime(timestamp) {
    return DateTime.fromMillis(timestamp).toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
  }

  // Subscribe to Instruments
  async subscribeInstruments() {
    if (!this.isAuthorized) {
      console.log('Authorization failed');
      return;
    }

    const subscribeReq = {
      clientId: this.clientId,
      token: this.accessToken,
      instruments: this.instruments.map(instrument => instrument),
    };

    console.log('Subscribing to Instruments:', subscribeReq);
    this.ws.send(JSON.stringify(subscribeReq));
  }

  // Set Callback for Ticks
  onTicks(callback) {
    this.onTicks = callback;
  }
}

// Example usage
const clientId = process.env.DHAN_CLIENT_ID;
const accessToken = process.env.DHAN_ACCESS_TOKEN;
console.log('Client ID:', process.env.DHAN_CLIENT_ID);
console.log('Access Token:', process.env.DHAN_ACCESS_TOKEN);

const instruments = [
  { symbol: 'TCS', token: 11536 },
];

const dhanFeed = new DhanFeed(clientId, accessToken, instruments);
dhanFeed.runForever();
