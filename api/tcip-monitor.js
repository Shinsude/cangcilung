var tcip = require('./_tcip');

module.exports = async function (req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    var data = await tcip.fetchTcipDashboard();
    var sig = tcip.extractSignal(data);
    var lastcheck = { ok: true, status: 'online', at: Date.now() };

    if (sig) {
      var prev = await tcip.getJson('tcip:latest');
      var history = await tcip.getJson('tcip:history');
      var newHistory = tcip.mergeHistory(history, sig, 60);
      await Promise.all([
        tcip.setJson('tcip:latest', tcip.summarize(sig)),
        tcip.setJson('tcip:history', newHistory),
        tcip.setJson('tcip:lastcheck', lastcheck)
      ]);
      res.status(200).json({ ok: true, changed: !tcip.sameSignal(prev, sig), signal: tcip.summarize(sig) });
      return;
    }

    await tcip.setJson('tcip:lastcheck', lastcheck);
    res.status(200).json({ ok: true, signal: null });
  } catch (err) {
    var errMsg = String((err && err.message) || err);
    var fail = { ok: false, status: 'offline', at: Date.now(), error: errMsg.slice(0, 200) };
    try {
      await tcip.setJson('tcip:lastcheck', fail);
    } catch (e) {}
    res.status(200).json({ ok: false, error: errMsg });
  }
};
