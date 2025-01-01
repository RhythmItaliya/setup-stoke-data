require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.get('/login', (req, res) => {
  const redirect_uri = encodeURIComponent(process.env.UPSTOX_REDIRECT_URI);
  const client_id = process.env.UPSTOX_API_KEY;
  const state = process.env.UPSTOX_RANDOM_STATE;
  const scope = process.env.UPSTOX_SCOPE;

  const auth_url = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${client_id}&redirect_uri=${redirect_uri}&state=${state}&scope=${scope}`;

  console.log('Please visit the following URL to log in to Upstox:');
  console.log(auth_url);

  res.send('Login URL generated. Check your console and click the link to log in.');
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (state !== process.env.UPSTOX_RANDOM_STATE) {
    return res.status(400).send('State mismatch - security issue!');
  }

  try {
    const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', null, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      params: {
        code,
        client_id: process.env.UPSTOX_API_KEY,
        client_secret: process.env.UPSTOX_API_SECRET,
        redirect_uri: process.env.UPSTOX_REDIRECT_URI,
        grant_type: 'authorization_code',
      },
    });

    const { access_token, extended_token } = response.data;

    console.log('Access Token:', access_token);
    console.log('Extended Token:', extended_token);

    res.send('Authentication successful! Check the console for the access token.');
  } catch (error) {
    console.error('Error exchanging token:', error.response ? error.response.data : error.message);
    res.status(500).send('Error exchanging token');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Navigate to http://localhost:${port}/login to start the authentication process.`);
});
