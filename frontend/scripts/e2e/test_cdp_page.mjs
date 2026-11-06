import http from 'node:http';

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

const targets = await getJSON('http://127.0.0.1:9222/json/list');
console.log('Open targets count:', targets.length);
if (targets.length > 0) {
  console.log('Target 0 title:', targets[0].title, targets[0].url);
}
