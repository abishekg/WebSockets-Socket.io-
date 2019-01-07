var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var app = express();
var fs = require('fs');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var config = require('./config/config');
var klaw = require('klaw-sync');
var rimraf = require('rimraf');
var splitFile = require('split-file');
// var sizeOf = require('object-sizeof');
// var chokidar = require('chokidar');

var isShoreReadyToSend = false;

app.use(bodyParser.json());
app.use(cors());

var clients = {}, fileIndex = 0, filePartIndex = 0;

io.on(config.connection, (socket) => {
  socket.on(config.disconnect, (listener) => {
    console.log("User was disconnected", listener);
  });
});

io.of('/' + config.nspVes1).on(config.connection, (socket) => {
  console.log("vessel1 connected");
  clients.vessel1 = socket;


  socket.on(config.shipReadyToSend, (value, callback) => {
    if (value.ready === true) {
      setTimeout(() => {
        callback(true);
      }, 5000)
    }
  })
  socket.on(config.shipReadyToReceive, (value, callback) => {
    if (value.ready === true)
    setTimeout(()=>{
      readDirectory(config.SHORE + config.VES1, __dirname + '\\file\\');
    }, 5000);
  })

  socket.on(config.SHORE + config.VES1, async (message, callback) => {
    console.log("received", message.filePartName);
    try {
      var vesselName = message.vesselName;
      var savedDirectory = '\\saved\\';
      var buff = new Buffer(message.fileContent);
      var noOfFiles = message.noOffiles;
      await directoryExists(__dirname + savedDirectory + vesselName);
      await directoryExists(__dirname + savedDirectory + vesselName + '\\' + message.fileName);
      fs.writeFileSync(__dirname + savedDirectory + vesselName + '\\' + message.fileName + '\\' + message.filePartName, buff);
      fs.readdir(__dirname + savedDirectory + vesselName + '\\' + message.fileName, async (err, files) => {
        if (files.length === noOfFiles) {
          var fileArr = []
          files.filter(file => {
            fileArr.push(__dirname + savedDirectory + vesselName + '\\' + message.fileName + '\\' + file);
          });
          splitFile.mergeFiles(fileArr, __dirname + savedDirectory + message.fileName).then(doc => {
            deleteFolder(__dirname + savedDirectory + vesselName + '\\' + message.fileName);
          })
        }
      })
      callback("Shore has received " + message.filePartName)
    } catch (error) {
      console.log(error);
    }
  });
});

function readDirectory(nspName, folderPath) {
  const files = klaw(folderPath, { nodir: true });
  fileIndex = 0;
  splitFiles(nspName, files, files.length);
}

async function splitFiles(nspName, files, fileCount) {
  var url = files[fileIndex].path;
  filePartIndex = 0;
  var processed = '\\processing';
  var folderArr = url.split('\\');
  var fileName = folderArr[folderArr.length - 1];
  try {
    await directoryExists(__dirname + processed);
    await directoryExists(__dirname + processed + '\\' + fileName);
    fs.copyFileSync(url, __dirname + processed + '\\' + fileName + '\\' + fileName);
    var docs = await splitFile.splitFileBySize(__dirname + processed + '\\' + fileName + '\\' + fileName, config.chunkSize).catch(err => {
      if (err)
        console.log("err", err);
    });
    await transportFile(nspName, docs, docs.length, fileName, fileCount, files);
  } catch (error) {
    console.log('error: ', error);
  }
}

function transportFile(nspName, docs, filePartCount, fileName, fileCount, files) {
  setTimeout(() => {
    try {
      var doc = docs[filePartIndex];
      var buff = fs.readFileSync(doc);
      var data = new Buffer(buff);
      var fileArr = doc.split('\\');
      var filePartName = fileArr[fileArr.length - 1];
      clients[config.nspVes1].emit(nspName, { noOffiles: filePartCount, fileName: fileName, filePartName: filePartName, fileContent: data, vesselName: "vessel1" }, (value) => {
        console.log(value);
        // fs.unlinkSync(doc);
        if (filePartIndex < filePartCount - 1) {
          filePartIndex++;
          transportFile(nspName, docs, filePartCount, fileName, fileCount, files);
        } else if (filePartIndex === filePartCount - 1 && fileIndex < fileCount - 1) {
          console.log('---------------------------------');
          setTimeout(() => {
            fs.renameSync(__dirname + '\\processing' + '\\' + fileName + '\\' + fileName, __dirname + '\\processed' + '\\' + fileName);
            // deleteFolder(__dirname + '\\processing' + '\\' + fileName);
            fileIndex++;
            splitFiles(nspName, files, fileCount);
          }, 1000)
        } else {
          fs.renameSync(__dirname + '\\processing' + '\\' + fileName + '\\' + fileName, __dirname + '\\processed' + '\\' + fileName);
          // deleteFolder(__dirname + '\\processing' + '\\' + fileName);
          console.log("completed");
        }
      })
    } catch (error) {
      console.log('error: ', error);
    }
  }, 100)
}

async function directoryExists(folderPath) {
  try {
    if (!fs.existsSync(folderPath))
      fs.mkdirSync(folderPath);
  } catch (error) {
    console.log('error: ', error);
  }

}

function deleteFolder(folderPath) {
  try {
    rimraf(folderPath, function (err) {
      if (err) {
        console.log('err: ', err);
      } else {
        // console.log("Folder Deleted ", new Date().toLocaleString());
      }
    })
  } catch (error) {
    console.log('error: ', error);
  }
}

async function directoryExists(folderPath) {
  try {
    if (!fs.existsSync(folderPath))
      fs.mkdirSync(folderPath);
  } catch (error) {
    console.log('error: ', error);
  }
}

app.get('/', (req, res) => {
  readDirectory('SPSHORE/VESSEL1', __dirname + '\\file\\');
  res.send("Web Sockets");
})

server.listen(7500, () => {
  console.log("Server is up on port 7500");
});