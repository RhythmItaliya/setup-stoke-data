require('dotenv').config();
const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const WebSocket = require("ws");
var UpstoxClient = require("upstox-js-sdk");
const protobuf = require("protobufjs");
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

let protobufRoot = null;
let defaultClient = UpstoxClient.ApiClient.instance;
let apiVersion = "2.0";
let OAUTH2 = defaultClient.authentications["OAUTH2"];
OAUTH2.accessToken = process.env.UPSTOX_ACCESS_TOKEN;

const initProtobuf = async () => {
    protobufRoot = await protobuf.load(__dirname + "/MarketDataFeed.proto");
    console.log("Protobuf part initialization complete");
};

const decodeProfobuf = (buffer) => {
    if (!protobufRoot) {
        console.warn("Protobuf part not initialized yet!");
        return null;
    }
    const FeedResponse = protobufRoot.lookupType("com.upstox.marketdatafeeder.rpc.proto.FeedResponse");
    return FeedResponse.decode(buffer);
};

const getMarketFeedUrl = async () => {
    return new Promise((resolve, reject) => {
        let apiInstance = new UpstoxClient.WebsocketApi();
        apiInstance.getMarketDataFeedAuthorize(
            apiVersion,
            (error, data, response) => {
                if (error) reject(error);
                else resolve(data.data.authorizedRedirectUri);
            }
        );
    });
};

const connectWebSocket = async (wsUrl, instrumentKeys) => {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
            headers: {
                "Api-Version": apiVersion,
                Authorization: "Bearer " + OAUTH2.accessToken,
            },
            followRedirects: true,
        });

        ws.on("open", () => {
            console.log("WebSocket connected");
            resolve(ws);

            setTimeout(() => {
                const data = {
                    guid: "someguid",
                    method: "sub",
                    data: {
                        mode: "full",
                        instrumentKeys: instrumentKeys,
                    },
                };
                ws.send(Buffer.from(JSON.stringify(data)));
            }, 1000);
        });

        ws.on("close", () => {
            console.log("WebSocket disconnected");
        });

        ws.on("message", (data) => {
            const decodedData = decodeProfobuf(data);
            console.log(decodedData);
            if (decodedData) {
                io.emit('marketData', decodedData); // Emit live market data to the frontend
            }
        });

        ws.on("error", (error) => {
            console.log("WebSocket error:", error);
            reject(error);
        });
    });
};

const subscribeToInstruments = async (instrumentKeys) => {
    console.log("Instrument Keys:", instrumentKeys);

    try {
        await initProtobuf();
        const wsUrl = await getMarketFeedUrl();
        await connectWebSocket(wsUrl, instrumentKeys);
    } catch (error) {
        console.error("An error occurred:", error);
    }
};

function filterData(filePath, targetName, callback) {
    const results = {
        FF: [],
        CE: [],
        PE: [],
        instrumentKeys: []
    };

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            if (row.name === targetName) {
                if (row.option_type === 'FF') {
                    results.FF.push(row);
                } else if (row.option_type === 'CE') {
                    results.CE.push(row);
                } else if (row.option_type === 'PE') {
                    results.PE.push(row);
                }

                if (row.instrument_key) {
                    results.instrumentKeys.push(row.instrument_key);
                }
            }
        })
        .on('end', () => {
            callback(results);
        });
}

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Route to display filtered data
app.get('/filter', (req, res) => {
    const targetName = req.query.name;
    const filePath = 'complete.csv';

    if (!targetName) {
        return res.send('<h1>Please provide a name using the "name" query parameter</h1>');
    }

    filterData(filePath, targetName, (groupedData) => {
        let table = `<h1>Filtered Data for Name: ${targetName}</h1>`;

        const generateTable = (data, type) => {
            let htmlTable = `<h2>${type} (Future / Call / Put)</h2>`;
            htmlTable += '<table border="1" style="width:100%; text-align:left;">';
            htmlTable += '<thead><tr>';
            Object.keys(data[0] || {}).forEach((key) => {
                htmlTable += `<th>${key}</th>`;
            });
            htmlTable += '</tr></thead><tbody>';
            data.forEach((row) => {
                htmlTable += '<tr>';
                Object.values(row).forEach((value) => {
                    htmlTable += `<td>${value}</td>`;
                });
                htmlTable += '</tr>';
            });
            htmlTable += '</tbody></table>';
            return htmlTable;
        };

        const ffTable = generateTable(groupedData.FF, 'FF');
        const ceTable = generateTable(groupedData.CE, 'CE');
        const peTable = generateTable(groupedData.PE, 'PE');

        res.render('index', {
            filteredData: `${table}${ffTable}${ceTable}${peTable}`,
        });

        if (groupedData.instrumentKeys.length > 0) {
            subscribeToInstruments(groupedData.instrumentKeys);
        }
    });
});

// Serve the EJS template with live updates
app.get('/', (req, res) => {
    res.render('index', {
        filteredData: ''
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at:`);
    console.log(`http://localhost:${PORT}/filter?name=STATE%20BANK%20OF%20INDIA`);
});
