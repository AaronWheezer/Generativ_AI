export default function initAdmin(app, db) {
  // List all dossiers
  app.get('/api/admin/dossiers', (req, res) => {
    db.all(
      'SELECT id, naam as name, email, telefoon as phone, locatie as location, stad as city, datum as datetime, beschrijving as description, prioriteit, politie_zone as zoneLabel, status, created_at FROM dossiers ORDER BY created_at DESC',
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ records: rows || [] });
      }
    );
  });

  // Update dossier by id
  app.put('/api/admin/dossiers/:id', (req, res) => {
    const id = Number(req.params.id);
    const {
      name,
      email,
      phone,
      location,
      city,
      datetime,
      description,
      prioriteit,
      zoneLabel,
      status,
    } = req.body || {};

    if (!id) return res.status(400).json({ error: 'invalid id' });

    const sql = `UPDATE dossiers SET naam = ?, email = ?, telefoon = ?, locatie = ?, stad = ?, datum = ?, beschrijving = ?, prioriteit = ?, politie_zone = ?, status = ? WHERE id = ?`;
    const params = [
      name,
      email,
      phone,
      location,
      city,
      datetime,
      description,
      prioriteit,
      zoneLabel,
      status,
      id,
    ];

    db.run(sql, params, function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ updated: this.changes > 0 });
    });
  });

  // Delete dossier by id
  app.delete('/api/admin/dossiers/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    
    db.run('DELETE FROM dossiers WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ deleted: this.changes > 0 });
    });
  });

  // Mark dossier as completed
  app.put('/api/admin/dossiers/:id/complete', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    
    db.run(
      'UPDATE dossiers SET status = ? WHERE id = ?',
      ['afgerond', id],
      function (err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ updated: this.changes > 0 });
      }
    );
  });
}