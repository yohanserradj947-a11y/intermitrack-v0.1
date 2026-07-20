# Sticker Intermitrack — dossier de fabrication

## 👉 LE FICHIER À ENVOYER

**`sticker-intermitrack-rond-90mm.png`**

C'est celui-là que tu uploades sur Amazon (ou tout autre fabricant qui demande « JPEG ou PNG, 15 Mo max »).

| | |
|---|---|
| Format | **PNG** |
| Dimensions | **2268 × 2268 px** |
| Résolution | **600 DPI** (le double du minimum exigé en impression) |
| Poids | **0,7 Mo** — très loin de la limite de 15 Mo |
| Fond | **Transparent hors du rond** → idéal pour une découpe ronde |
| Taille physique | **96 mm** de diamètre (= 90 mm + 3 mm de fond perdu) |

### ✅ Déjà vérifié pour toi
- Le **QR décode** bien vers `https://intermitrack.fr/app.html` (testé sur le fichier final, pas sur la maquette).
- Les **repères de découpe ont été retirés** (ils n'apparaissent pas sur le PNG).
- Les **textes sont rasterisés** → aucun risque de substitution de police.
- Les **coins sont transparents** → la découpe ronde tombe juste.

### Ce que tu commandes
- **Forme :** ronde · **Diamètre :** 90 mm (ou 96 mm si le service coupe au bord de l'image — les deux marchent, rien d'important n'est dans les 3 mm extérieurs)
- **Matière conseillée :** vinyle **laminé mat** → résiste à la pluie et aux frottements, et le mat évite les reflets qui empêchent de scanner le QR.

### ⚠️ Le seul vrai contrôle à faire
**Scanne le QR** depuis l'aperçu du fabricant (ou sur le premier exemplaire reçu) **avant de commander en grande quantité**. Tu dois tomber sur la page avec les deux boutons App Store / Google Play.

---

## Les autres fichiers

**`sticker-intermitrack-rond-90mm.svg`** — la version **vectorielle** (modifiable, nette à n'importe quelle taille).
Utile si :
- un imprimeur pro te demande du vectoriel ou un PDF,
- tu veux changer un texte ou une couleur plus tard,
- tu veux régénérer le PNG dans une autre taille.

⚠️ Le SVG contient un calque `reperes-a-supprimer` (cercles pointillés) et ses **textes ne sont pas vectorisés**. Avant tout envoi d'un SVG/PDF à un imprimeur : ouvre-le dans **Inkscape** (gratuit) → supprime les pointillés → **Chemin > Objet en chemin** (transforme les lettres en formes).

### Régénérer le PNG (autre taille)
```
npx @resvg/resvg-js-cli source.svg sortie.png --fit-width 2268
```
(`2268` = 600 DPI pour 96 mm. Pour 300 DPI : `1134`.)

---

## Le design

Fond **pétrole** `#1F4E5F` avec halo **orange** `#F97316` (effet projecteur), les **9 onglets de l'appli** en couronne, **INTERMITRACK** au-dessus du QR, **« TOUTE TON INTERMITTENCE »** en dessous.

Le QR fait **34 mm** → chaque module mesure **0,83 mm**, bien au-dessus du seuil de fiabilité (~0,6 mm). Il est en correction **H** : il scanne encore rayé ou sali. **Ne jamais le réduire sous 30 mm**, ni supprimer sa pastille blanche.

*Note : sur la moitié basse, les onglets se lisent à l'envers — c'est le principe du texte qui suit un cercle, comme sur un tampon ou une capsule de bière. C'est voulu.*
