const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const app = express();
const fileUpload = require('express-fileupload');
const port = 6789;
const fs = require('fs');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const rateLimit = require('express-rate-limit');

//######################################################################################################################################################


// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-uluieste views / layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client(e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc înformat json în req.body
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));
//utilizare modul cookie
app.use(cookieParser())
//utilizare modul de sesiune
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use(fileUpload());

function resourceExists(url) {
  const existingResources = [
    '/',
    '/index',
    '/chestionar',
    '/rezultat-chestionar',
    '/autentificare',
    '/autentificare?',
    '/verifica-autentificare',
    '/delogare',
    '/creare-bd',
    '/inserare-bd',
    '/adaugare_cos',
    '/vizualizare-cos',
    '/vizualizare-cos?',
    '/admin',
    '/admin/adauga-produs',
    '/admin/adauga-produs?',
    '/chat',
    '/trimite-mesaj'
  ];

  return existingResources.includes(url);
}

const accessTracker = {};

// Middleware pentru detectarea accesărilor 
//la resurse inexistente și blocarea utilizatorilor
app.use((req, res, next) => {
  const ipAddress = req.ip;
  const accessCount = accessTracker[ipAddress]?.count || 0; // Numărul de accesări al utilizatorului
  const lastAccessTime = accessTracker[ipAddress]?.time || 0; // Timpul ultimei accesări al utilizatorului
  const currentTime = Date.now(); // Timpul curent
  const blockTime = accessTracker[ipAddress]?.blockTime || 0; // Timpul de blocare al utilizatorului

  // Verificăm dacă utilizatorul este blocat și nu i s-a scurs timpul de blocare
  if (blockTime && currentTime - blockTime < 0) {
    console.log(`Utilizatorul ${ipAddress} este blocat.`);
    return res.status(403).send('Acces interzis pentru următoarea perioadă.');
  }

  // Verificăm dacă resursa nu există și utilizatorul trebuie blocat
  if (!resourceExists(req.url)) {
    // Verificăm dacă utilizatorul a făcut prea multe accesări în ultimul minut
    if (accessCount >= 100000000 && currentTime - lastAccessTime < 60000) {
      console.log(`Utilizatorul ${ipAddress} a fost blocat.`);
      accessTracker[ipAddress].blockTime = currentTime; // Setăm timpul de blocare
      return res.status(403).send('Acces interzis pentru următoarea perioadă.');
    }

    // Actualizăm numărul de accesări și timpul ultimei accesări pentru utilizator
    accessTracker[ipAddress] = {
      count: accessCount + 1,
      time: currentTime
    };

    console.log(`Resursa ${req.url} nu există!`);
    return res.status(404).send('Resursa nu a fost găsită.');
  }

  // Dacă resursa există, trecem la următorul middleware sau rută
  next();
});


//FUNCTIONS########################################################################################################################################
function getAllProducts() {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database('cumparaturi.db', (err) => {
      if (err) {
        console.error(err.message);
        reject(err);
      }
      console.log('Connected to the produse database.');
    });

    let produse = [];

    db.serialize(() => {
      //verificam existenta tabelei produse
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='produse'`, (err, row) => {
        if (err) {
          console.error(err.message);
          reject(err);
        }
        if (row) {
          db.all(`SELECT * FROM produse`, (err, rows) => {
            if (err) {
              console.error(err.message);
              reject(err);
            }
            rows.forEach(row => produse.push(row));
            db.close((err) => {
              if (err) {
                console.error(err.message);
                reject(err);
              }
              resolve(produse);
            });
          });
        } else {
          console.log('Tabela produse nu exista.');
          resolve(produse);
        }
      });
    });
  });
}
function getAllMessages() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database('cumparaturi.db', (err) => {
      if (err) {
        console.error(err.message);
        reject(err);
      }
      console.log('Connected to the mesaje database.');
    });

    const mesaje = [];

    db.serialize(() => {
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='mesaje'`, (err, row) => {
        if (err) {
          console.error(err.message);
          reject(err);
        }
        if (row) {
          db.all(`SELECT * FROM mesaje`, (err, rows) => {
            if (err) {
              console.error(err.message);
              reject(err);
            }
            rows.forEach(row => mesaje.push(row));
            db.close((err) => {
              if (err) {
                console.error(err.message);
                reject(err);
              }
              resolve(mesaje);
            });
          });
        } else {
          console.log('Tabela mesaje nu există.');
          resolve(mesaje);
        }
      });
    });
  });
}

const getProdusByID = (db, idProdus) => {
  const sql = 'SELECT * FROM produse WHERE id = ?';
  const id = parseInt(idProdus);

  return new Promise((resolve, reject) => {
    db.get(sql, [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row) {
        const produs = {
          id: row.id,
          nume: row.nume,
          pret: row.pret,
          imagine: row.imagine
        };

        resolve(produs);
      } else {
        reject(new Error(`Produsul cu id-ul ${idProdus} nu a fost găsit.`));
      }
    });
  });
};

const getProduseCos = (cos) => {
  const produseCos = [];
  const db = new sqlite3.Database('cumparaturi.db');

  return new Promise((resolve, reject) => {
    const numarProduse = cos.length;
    let numarProduseFinalizate = 0;

    if (numarProduse === 0) {
      db.close();
      resolve(produseCos);
    }
    

    for (const produs of cos) {
      const idProdus = produs.id;
      getProdusByID(db, idProdus)
        .then((produsDB) => {
          const produsCos = {
            id: produsDB.id,
            nume: produsDB.nume,
            pret: produsDB.pret,
            imagine: produsDB.imagine,
            cantitate: produs.cantitate
          };

          produseCos.push(produsCos);
          numarProduseFinalizate++;

          if (numarProduseFinalizate === numarProduse) {
            db.close();
            resolve(produseCos);
          }
        })
        .catch((error) => {
          db.close();
          reject(error);
        });
    }
  });
};
//middleware care adauga variabile locale din sesiune, pt a le putea folosi in ejs
app.use((req, res, next) => {
  res.locals.userName = req.session.userName;
  res.locals.isAdmin = req.session.isAdmin;
  res.locals.errorMsg = req.session.errorMsg;
  req.session.produse = req.session.produse;

  next();
});



function insertMessage(username, message, isAdmin) {
  const db = new sqlite3.Database('cumparaturi.db');
  const insertQuery = 'INSERT INTO mesaje (username, mesaj, isAdmin) VALUES (?, ?, ?)';
  db.run(insertQuery, [username, message, isAdmin], function(err) {
    if (err) {
      console.error(err.message);
    } else {
      console.log('Mesajul a fost inserat cu succes!');
    }
  });

  db.close();
}

//SERVER##########################################################################################################################################
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'HelloWorld'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res
app.get('/', async (req, res) => {
  try {
    const userName = req.session.userName;
    const errorMsg = req.session.errorMsg;
    const isAdmin = req.session.isAdmin;
    // așteaptă până când toate produsele sunt extrase
    const produse = await getAllProducts();

    // adaugă produsele în sesiune
    req.session.produse = produse;


    res.render('index', { userName, errorMsg, produse, isAdmin });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată

app.get('/chestionar', (req, res) => {
  fs.readFile('./intrebari.json', 'utf8', (err, data) => {
    const userName = req.session.userName;
    
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    const listaIntrebari = JSON.parse(data);
    res.render('chestionar', { intrebari: listaIntrebari, userName: userName });
  });
});

app.post('/rezultat-chestionar', (req, res) => {
  const raspunsuri = req.body;
  const userName = req.session.userName;
  fs.readFile('./intrebari.json', 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    const listaIntrebari = JSON.parse(data);
    let corecte = 0;
    for (let i = 0; i < listaIntrebari.length; i++) {
      if (raspunsuri[`intrebare${i}`] == listaIntrebari[i].corect) {
        corecte++;
      }
    }
    res.render('rezultat-chestionar', { corecte: corecte, userName: userName });
  });
});

//middleware folosit pentru limitarea numarului de logIn -uri la 3 si blocare 30 sec
const loginLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 secunde
  max: 3,
  message:
    "Încercați din nou peste 30 secunde."
});

app.get('/autentificare', loginLimiter, (req, res) => {
  //const userName = req.cookies.userName;
  const userName = req.session.userName;
  const errorMsg = req.session.errorMsg;
  const isAdmin = req.session.isAdmin;
  console.log(errorMsg);
  res.render('autentificare', { errorMsg: errorMsg, userName: userName, isAdmin: isAdmin });
});

app.post('/verifica-autentificare', (req, res) => {

  const auth = req.body;
  const utilizatoriJSON = fs.readFileSync('utilizatori.json');
  const utilizatori = JSON.parse(utilizatoriJSON);

  // Verificați dacă numele de utilizator conține caracterele interzise
  const regex = /[<>#]/g;
  if (regex.test(auth.nume)) {
    req.session.errorMsg = 'Nume de utilizator invalid';
    return res.redirect('/autentificare');
  }

  // Verificați lungimea numele de utilizator
  if (auth.nume.length > 10) {
    req.session.errorMsg = 'Nume de utilizator prea lung';
    return res.redirect('/autentificare');
  }

  const utilizatorAutentificat = utilizatori.find(
    (user) => user.userName === auth.nume && user.password === auth.parola
  );

  if (utilizatorAutentificat) {
    req.session.userName = auth.nume;
    //utilizare cookieee
    //res.cookie('userName', auth.nume);

    req.session.isAdmin = utilizatorAutentificat.admin; // Adăugăm câmpul isAdmin în sesiune

    res.redirect('/');
  } else {
    req.session.errorMsg = 'Utilizator invalid';
    res.redirect('/autentificare');
  }
});


app.post('/delogare', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.post('/creare-bd', (req, res) => {
  const db = new sqlite3.Database('cumparaturi.db', (err) => {
    if (err) {
      console.error('Eroare la conectarea la baza de date: ', err);
      res.status(500).send('Eroare la conectarea la baza de date');
      return;
    }

    db.run('CREATE TABLE IF NOT EXISTS produse (id INTEGER PRIMARY KEY AUTOINCREMENT, nume TEXT, pret REAL, imagine TEXT)', (err) => {
      if (err) {
        console.error('Eroare la crearea tabelului "produse": ', err);
        res.status(500).send('Eroare la crearea tabelului "produse"');
        return;
      }

      db.run('CREATE TABLE IF NOT EXISTS mesaje (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, mesaj TEXT, isAdmin INTEGER)', (err) => {
        if (err) {
          console.error('Eroare la crearea tabelului "mesaje": ', err);
          res.status(500).send('Eroare la crearea tabelului "mesaje"');
          return;
        }

        db.close();

        res.redirect(303, '/');
      });
    });
  });
});

app.post('/inserare-bd', (req, res) => {
  const products = [
    { nume: 'Psihologia Comunicarii', imagine: 'imagini/img1.jpeg', pret: 50.99 },
    { nume: 'Arta de a fi', imagine: 'imagini/img2.png', pret: 19.99 },
    { nume: 'Atomic Habits', imagine: 'imagini/img3.jpeg', pret: 47.99 },
    { nume: 'Python Machine Learning', imagine: 'imagini/img4.jpg', pret: 147.50 },
    { nume: 'Python Programming', imagine: 'imagini/img5.jpg', pret: 45.99 },
    { nume: 'C++, In 8 hours', imagine: 'imagini/img6.jpg', pret: 37.99 },
    { nume: 'Learn JS Quickly', imagine: 'imagini/img7.jpg', pret: 100.99 },
    { nume: 'Java for Beginners', imagine: 'imagini/img8.jpg', pret: 89.99 },
    { nume: 'AI Superpowers', imagine: 'imagini/img9.jpg', pret: 111.11 },
    { nume: 'Digital Gold', imagine: 'imagini/img10.jpg', pret: 999999.999999 },
    { nume: 'Blockchain', imagine: 'imagini/img11.jpg', pret: 189.99 },
    { nume: 'Ethereum', imagine: 'imagini/img12.jpg', pret: 154.99 },
    { nume: 'FIT GENERATION: Primul manual de fitness din Romania', imagine: 'imagini/img13.jpg', pret: 33.99 },
    { nume: 'The Science of Nutrition', imagine: 'imagini/img14.jpg', pret: 23.99 }
  ];

  const db = new sqlite3.Database('cumparaturi.db', (err) => {
    if (err) {
      console.error('Eroare la conectarea la baza de date: ', err);
      res.status(500).send('Eroare la conectarea la baza de date');
      return;
    }

    const selectQuery = 'SELECT COUNT(*) as count FROM produse WHERE nume = ?';
    const insertQuery = 'INSERT INTO produse (nume, pret, imagine) VALUES (?, ?, ?)';
    const insertPromises = [];

    products.forEach(product => {
      const { nume, pret, imagine } = product;

      insertPromises.push(new Promise((resolve, reject) => {
        db.get(selectQuery, [nume], (err, row) => {
          if (err) {
            console.error('Eroare la interogarea bazei de date: ', err);
            reject(err);
          } else {
            const count = row.count;
            if (count === 0) {
              db.run(insertQuery, [nume, pret, imagine], function (err) {
                if (err) {
                  console.error('Eroare la inserarea în baza de date: ', err);
                  reject(err);
                } else {
                  console.log('Produsul a fost inserat cu succes în baza de date, ID:', this.lastID);
                  resolve();
                }
              });
            } else {
              console.log('Produsul', nume, 'există deja în baza de date. Nu se va insera din nou.');
              resolve(); // Continuăm cu următorul produs
            }
          }
        });
      }));
    });

    Promise.all(insertPromises)
      .then(() => {
        db.close();
        res.redirect('/');
      })
      .catch(error => {
        db.close();
        res.status(500).send('Eroare la inserarea în baza de date');
      });
  });
});



app.post('/adaugare_cos', (req, res) => {
  const idProdus = req.body.id;
  if (!req.session.cos) {
    req.session.cos = [];
  }
  // Verificăm dacă produsul există deja în coș
  let produsInCos = req.session.cos.find((produs) => produs.id === idProdus);
  if (produsInCos) {
    // Dacă produsul există, creștem cantitatea
    produsInCos.cantitate++;
  } else {
    // Dacă produsul nu există, îl adăugăm cu cantitatea 1
    req.session.cos.push({ id: idProdus, cantitate: 1 });
  }
  res.redirect('/');
});



app.get('/vizualizare-cos', (req, res) => {

  const userName = req.session.userName;
  if (req.session.cos) {
    const produseCos = getProduseCos(req.session.cos)
    getProduseCos(req.session.cos)
      .then((produseCos) => {
        res.render('vizualizare-cos', { produse: produseCos, userName: userName });
      })
  } else {
    res.render('vizualizare-cos', { produse: [], userName: userName });
  }

});

app.get('/admin', (req, res) => {
  res.render('admin');
});



app.post('/admin/adauga-produs', (req, res) => {
  const produs = req.body;

  // Verificați dacă numele produsului conține caracterele interzise
  const regex = /[<>#]/g;
  if (regex.test(produs.nume)) {
    return res.status(400).send('Numele produsului conține caractere invalide.');
  }

  if (!req.files || !req.files.imagine) {
    return res.status(400).send('Nu s-a încărcat nicio imagine.');
  }

  const imagine = req.files.imagine;
  const caleDestinatie = 'public/imagini/' + imagine.name;
  const caleBD = 'imagini/' + imagine.name;
  console.log(caleDestinatie);
  console.log(imagine);
  fs.writeFile(caleDestinatie, imagine.data, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Eroare la salvarea imaginii.');
    }

    const db = new sqlite3.Database('cumparaturi.db', (err) => {
      if (err) {
        console.error('Eroare la conectarea la baza de date: ', err);
        res.status(500).send('Eroare la conectarea la baza de date');
        return;
      }

      const query = 'INSERT INTO produse (nume, pret, imagine) VALUES (?, ?, ?)';
      db.run(query, [produs.nume, produs.pret, caleBD], function (err) {
        if (err) {
          console.error('Eroare la inserarea în baza de date: ', err);
          db.close();
          res.status(500).send('Eroare la inserarea în baza de date');
          return;
        }

        console.log('Produsul a fost inserat cu succes în baza de date, ID:', this.lastID);
        db.close();
        res.redirect('/');
      });
    });
  });
});

app.get('/chat', async (req, res) => {
  const userName = req.session.userName;
  const isAdmin = req.session.isAdmin;
  const messages =  await getAllMessages();
   req.session.messages = messages;
  res.render('chat', {userName, messages, isAdmin});
});

app.post('/trimite-mesaj', async (req, res) => {
  const userName = req.session.userName;
  const mess = req.body.mess;
  const isAdmin = req.session.isAdmin;
  insertMessage(userName, mess, isAdmin);
  const messages = req.session.messages;

  //console.log(userName);
  //res.render('chat',{messages, isAdmin});
  res.redirect('/chat');
});

app.listen(port, '192.168.1.232',() => console.log(`Serverul rulează la adresa :${port}`));