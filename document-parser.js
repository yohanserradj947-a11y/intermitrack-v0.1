// ============================================
// DOCUMENT PARSER - Intermitrack
// Adapté à la vraie structure du projet
// ============================================

function monterWidgetParser() {
  const container = document.getElementById('document-parser-container');
  if (!container) return;

  container.innerHTML = `
    <div style="
      border: 2px dashed #6c63ff;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      background: rgba(108,99,255,0.05);
      margin-bottom: 20px;
    ">
      <p style="font-weight:600; margin:0 0 6px; color:#1F4E5F;">
        📄 Importer un contrat ou fiche de paie
      </p>
      <p style="font-size:13px; color:#888; margin:0 0 12px;">
        L'IA lit ton document et remplit le formulaire automatiquement
      </p>
      <input type="file" id="doc-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none">
      <button type="button" id="doc-btn" style="
        padding: 8px 20px;
        background: #1F4E5F;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      ">Choisir un fichier</button>
      <p id="doc-status" style="margin-top:12px; font-size:13px; color:#888; min-height:20px;"></p>
    </div>
  `;

  document.getElementById('doc-btn').addEventListener('click', () => {
    document.getElementById('doc-input').click();
  });

  document.getElementById('doc-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('doc-status');
    const btn = document.getElementById('doc-btn');

    status.textContent = '⏳ Analyse en cours…';
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
      const data = await analyserDocument(file);
      preremplirFormulaire(data);
      await sauvegarderDocumentDansRubrique(file, data);
      status.style.color = '#28a745';
      status.textContent = '✅ Formulaire pré-rempli et document classé dans vos documents !';
    } catch (err) {
      status.style.color = '#dc3545';
      status.textContent = `❌ Erreur : ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
}

// Envoie le fichier à l'Edge Function pour analyse IA
async function analyserDocument(file) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Tu dois être connecté.');

  // Upload temporaire dans documents-missions pour que l'IA puisse le lire
  const cheminTemp = `${user.id}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await sb.storage
    .from('documents-missions')
    .upload(cheminTemp, file);

  if (uploadError) throw new Error('Erreur upload : ' + uploadError.message);

  // URL signée valable 60 secondes pour l'Edge Function
  const { data: urlData } = await sb.storage
    .from('documents-missions')
    .createSignedUrl(cheminTemp, 60);

  const { data: { session } } = await sb.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      fileUrl: urlData.signedUrl,
      fileName: file.name
    })
  });

  // Nettoyage du fichier temporaire
  await sb.storage.from('documents-missions').remove([cheminTemp]);

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Erreur analyse IA');
  }

  return await response.json();
}

// Sauvegarde le document dans la rubrique Documents (comme si l'user l'avait ajouté manuellement)
async function sauvegarderDocumentDansRubrique(file, data) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  // Détermine le type de document depuis ce que l'IA a trouvé
  const typesValides = ['AEM', 'Fiche de paie', 'Congés Spectacles', 'Contrat', 'Autre'];
  const typeDoc = typesValides.includes(data.typeDocument) ? data.typeDocument : 'Contrat';

  // Détermine le mois et l'année depuis la date de début extraite
  let mois = new Date().getMonth() + 1;
  let annee = new Date().getFullYear();

  if (data.dateDebut) {
    const d = new Date(data.dateDebut + 'T00:00:00');
    mois = d.getMonth() + 1;
    annee = d.getFullYear();
  }

  const production = data.production || 'Sans production';

  // Chemin identique à uploadDocument() existant
  const cleanName = String(file.name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 90);

  const filePath = `${user.id}/${annee}/${String(mois).padStart(2, '0')}/${Date.now()}_${cleanName}`;

  // Upload dans le bucket documents (celui déjà existant)
  const { error: uploadError } = await sb.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });

  if (uploadError) throw new Error('Erreur sauvegarde document : ' + uploadError.message);

  // Insertion en base exactement comme uploadDocument()
  const { error: insertError } = await sb.from('documents').insert({
    user_id: user.id,
    file_name: file.name,
    file_path: filePath,
    document_type: typeDoc,
    production: production,
    doc_month: mois,
    doc_year: annee,
    mime_type: file.type || null
  });

  if (insertError) {
    await sb.storage.from('documents').remove([filePath]);
    throw new Error('Erreur base de données : ' + insertError.message);
  }

  // Recharge la liste des documents
  await loadDocuments();
}

// Pré-remplit le formulaire mission avec les données extraites
function preremplirFormulaire(data) {
  if (data.production && $('production')) {
    $('production').value = data.production;
  }
  if (data.type && $('type')) {
    $('type').value = data.type;
  }
  if (data.dateDebut && $('date')) {
    $('date').value = data.dateDebut;
  }
  if (data.dateFin && $('endDate')) {
    $('endDate').value = data.dateFin;
  }
  if (data.heures && $('hours')) {
    $('hours').value = data.heures;
  }
  if (data.montantBrut && $('gross')) {
    $('gross').value = data.montantBrut;
  }

  // Met à jour l'aperçu km si présent
  updateKmPreview();
}
