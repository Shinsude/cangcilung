var tcip = require('./_tcip');

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  var latest = await tcip.getJson('tcip:latest');
  var history = await tcip.getJson('tcip:history');
  var lastcheck = await tcip.getJson('tcip:lastcheck');

  if (!latest && tcip.UPSTASH_URL) {
    try {
      var data = await tcip.fetchTcipDashboard();
      latest = tcip.summarize(tcip.extractSignal(data));
    } catch (e) {}
  }

  res.status(200).json({
    latest: latest || null,
    history: Array.isArray(history) ? history : [],
    lastcheck: lastcheck || null
  });
};
