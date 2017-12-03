const express = require("express");
const path = require("path");
const app = express();

const fs = require("fs");
const async = require("async");
const bodyParser = require("body-parser");
const through = require("through");

const localAssetsDir = __dirname + "/public";
require("dotenv").config();

const storj = require("storj-lib");
const storj_utils = require("storj-lib/lib/utils");
const api = "https://api.storj.io";
let client;
const KEYRING_PASS = process.env.KEYRING_PASS;
const keyring = storj.KeyRing("./");

const STORJ_EMAIL = process.env.STORJ_EMAIL;
const STORJ_PASSWORD = process.env.STORJ_PASSWORD;

// heroku config:set STORJ_MNEMONIC=<VALUE FROM .ENV FILE>
// const STORJ_MNEMONIC = process.env.STORJ_MNEMONIC || generateMnemonic();

const storjCredentials = {
    email: STORJ_EMAIL,
    password: STORJ_PASSWORD
};

const AWS = require("aws-sdk");
const S3_BUCKET = process.env.S3_BUCKET;

const fetch = require("node-fetch");

// Helps to break up endpoint logs
const separator = () => {
    return console.log("================================================================");
};

app.use(express.static(path.resolve(__dirname, "../react-ui/build")));

app.set("port", (process.env.PORT || 5000));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ROUTES

// Authenticate Storj instance
app.get("/user/authenticate", function(req, res) {
    separator();
    console.log("Logging in with basic auth...");
    if (!STORJ_EMAIL || !STORJ_PASSWORD) {
        return res.status(400).send("No credentials!")
    }
    client = storj.BridgeClient(api, { basicAuth: storjCredentials });
    console.log("Logged in with basic auth:", storjCredentials);
    res.status(200).send("OK");
});

// Create a bucket
app.post("/buckets/create", (req, res) => {
    separator();
    client.createBucket({ name: req.body.name }, (err, bucket) => {
        if (err) { return console.log("Error: ", err.message); }
        console.log("Created bucket:", bucket);
        res.status(200).send(bucket);
    });
});

// Delete a bucket
app.post("/buckets/delete", (req, res) => {
    separator();
    client.destroyBucketById(req.body.bucketID, (err) => {
        if (err) { return console.log("Error: ", err.message); }
        console.log("Deleted bucket:", req.body.bucketID);
        res.status(200).send("OK");
    });
});

// Get all buckets
app.get("/buckets/list", (req, res) => {
    separator();
    client.getBuckets((err, buckets) => {
        if (err) { return console.log("Error: ", err.message); }
        console.log("Retrieved buckets:", buckets);
        res.status(200).send(buckets);
    });
});

// Generate a key for the uploaded file
function getFileKey(user, bucketID, fileName) {
    console.log("Generating filekey...");
    generateMnemonic();
    const realBucketID = storj_utils.calculateBucketId(user, bucketID);
    const realFileID = storj_utils.calculateFileId(bucketID, fileName);
    const fileKey = keyring.generateFileKey(realBucketID, realFileID);
    console.log("Filekey generated");
    return fileKey;
}

// Generate or retrieve the mnemonic phrase for the keyring
function generateMnemonic() {
    console.log("Attempting to retrieve mnemonic");
    let mnemonic = keyring.exportMnemonic(), newMnemonic;
    if (mnemonic) {
        console.log("Mnemonic already exists:", mnemonic);
    } else {
        console.log("Mnemonic doesn\"t exist or new keyring");
        try {
            keyring.importMnemonic(process.env.STORJ_MNEMONIC);
        } catch(err) {
            console.log("process.env.STORJ_MNEMONIC:", err);
            try {
                keyring.importMnemonic(keyring.generateDeterministicKey());
            } catch(err) {
                console.log("generateDeterministicKey():", err);
            }
        }
    }
    if (!process.env.STORJ_MNEMONIC) {
        console.log("Mnemonic not saved to env consts. Saving...");
        fs.appendFileSync("./.env", `\nSTORJ_MNEMONIC="${mnemonic || newMnemonic}"`);
        console.log('Mnemonic written to .env file. Make sure to add this to Heroku config with \'heroku config:set STORJ_MNEMONIC="<VALUE FROM .ENV FILE>\'');
        return;
    }
}

// Upload a file to the chain
// app.post("/buckets/upload/file", (req, res) => {
//     separator();
//
//     console.log(req.body.file);
//
//     const bucketID = req.body.bucketID;
//     console.log("Bucket selected:", bucketID);
//
//     const fileName = req.body.name;
//     console.log("File name:", fileName);
//
//     // Step 1b) Path of file
//     const filePath = "./server/temp/" + fileName;
//     const cryptPath = filePath + ".crypt";
//
//     // Step 2) Create a filekey with username, bucketID, and fileName
//     const fileKey = getFileKey(STORJ_EMAIL, bucketID, fileName);
//     console.log("File key:", fileKey);
//
//     // Step 3) Create a temporary path to store the encrypted file
//
//     // Step 4) Instantiate encrypter
//     const encrypter = new storj.EncryptStream(fileKey);
//
//     fs.writeFile(filePath, req.body.file, "utf8", (err) => {
//         if (err) { return console.log("Error: ", err.message); }
//         console.log("Uploaded file saved to temp directory");
//     });
//
//     // Step 5) Encrypt file
//     fs.createReadStream(filePath)
//         .pipe(encrypter)
//         .pipe(fs.createWriteStream(cryptPath))
//         .on("finish", () => {
//             console.log("Uploaded file encrypted");
//
//             client.createToken(bucketID, "PUSH", (err, token) => {
//
//                 if (err) { return console.log("Error: ", err.message); }
//
//                 console.log("Created token:", token.token);
//
//                 client.storeFileInBucket(bucketID, token.token, cryptPath, (err, file) => {
//                     if (err) { return console.log("Error: ", err.message); }
//
//                     console.log(`File ${fileName} uploaded to: ${bucketID}`);
//
//                     fs.unlink(filePath, function(err) {
//                         if (err) { return console.log("Error: ", err.message); }
//                         console.log("Original unencrypted file deleted");
//                     });
//
//                     fs.unlink(cryptPath, function(err) {
//                         if (err) { return console.log("Error: ", err.message); }
//                         console.log("Temporary encrypted file deleted");
//                     });
//                     res.status(200).send(file);
//
//                 });
//             });
//         });
// });

app.post("/buckets/upload", (req, res) => {
    separator();

    const bucketID = req.body.bucketID;
    console.log("Bucket selected:", bucketID);

    const fileName = req.body.name;
    console.log("File name:", fileName);

    // Step 1b) Path of file
    const filePath = "./server/temp/" + fileName + ".txt";
    const cryptPath = filePath + ".crypt";

    // Step 2) Create a filekey with username, bucketID, and fileName
    const fileKey = getFileKey(STORJ_EMAIL, bucketID, fileName);
    console.log("File key:", fileKey);

    const fileBucket = bucketID + "/" + fileName;
    const url = `https://${S3_BUCKET}.s3.amazonaws.com/${fileBucket}`;
    console.log("AWS S3 URL:", url);

    // Step 4) Instantiate encrypter
    const encrypter = new storj.EncryptStream(fileKey);

    fs.writeFile(filePath, "" + url, (err) => {
        if (err) { return console.log("Error: ", err.message); }
        console.log("Uploaded file saved to temp directory");
    });

    const s3 = new AWS.S3();
    const s3Params = {
        Bucket: S3_BUCKET,
        Key: fileBucket,
        Expires: 60,
        ContentType: req.body.type,
        Body: req.body.file,
        ServerSideEncryption: "AES256",
        ACL: "public-read"
    };

    s3.putObject(s3Params, (err, data) => {
        if (err) { return console.log("Error: ", err.message); }

        client.createToken(bucketID, "PUSH", (err, token) => {
            if (err) { return console.log("Error: ", err.message); }
            console.log("Created token:", token.token);

            client.storeFileInBucket(bucketID, token.token, filePath, (err, file) => {
                if (err) { return console.log("Error: ", err.message); }
                console.log(`File ${fileName} uploaded to BC: ${bucketID}`);

                fs.unlink(filePath, function(err) {
                    if (err) { return console.log("Error: ", err.message); }
                    console.log("Original unencrypted file deleted");
                });

                res.status(200).send({
                    url: url,
                    data: data
                });
                res.end();
            });
        });

        // fetch(data, { method: "PUT", body: req.body.file})
        //     .then((fetchRes) => {
        //         console.log(fetchRes);
        //         res.status(fetchRes.status).send({
        //             status: fetchRes.status,
        //             statusText: fetchRes.statusText,
        //             url: url
        //         });
        //         res.end();
        //     })
        //     .then((err) => {
        //         console.log(err);
        //         res.status(err.status).send({ error: err });
        //         res.end();
        //     });
    });
});

app.get("/buckets/all", (req, res) => {
    separator();
    let bucketFiles = {};
    client.getBuckets((err, buckets) => {
        if (err) { return console.log("Error: ", err.message); }
        async.each(buckets, (bucket, callback) => {
            client.listFilesInBucket(bucket.id, (err, files) => {
                if (err) { return callback(err); }
                bucketFiles[bucket.name] = {
                    files: files,
                    id: bucket.id,
                    name: bucket.name
                };
                callback(null);
            })
        }, (err) => {
            if (err) { return console.log("Error: ", err.message); }
            console.log("All files from all buckets assembled");
            res.status(200).send(bucketFiles);
        });
    });
});

// app.post("/buckets/download", function(req, res) {
//     separator();
//     const bucketID = req.body.bucketID;
//     console.log("Bucket ID:", bucketID);
//     const fileName = req.body.name;
//     console.log("File Name:", fileName);
//     client.listFilesInBucket(bucketID, function (err, files) {
//         if (err) { return console.log("Error: ", err.message); }
//         let fileList = files.find(function (file) {
//             return file.filename.match(fileName);
//         });
//         const fileID = fileList.id;
//         console.log("File ID:", fileID);
//         const filePath = "./server/download/" + fileName;
//         const target = fs.createWriteStream(filePath);
//         const fileKey = getFileKey(STORJ_EMAIL, bucketID, fileName);
//         const decrypter = new storj.DecryptStream(fileKey);
//         console.log("Creating file stream...");
//         client.createFileStream(bucketID, fileID, {exclude: []}, (err, stream) => {
//             if (err) { return console.log("Error: ", err.message); }
//             stream.on("error", (err) => {
//                 console.log("Failed to download shard: %s", [err.message]);
//                 fs.unlink(filePath, (unlinkFailed) => {
//                     if (unlinkFailed) { return console.log("Error: ", err.message); }
//                 });
//             }).pipe(decrypter).pipe(target);
//             target.on("finish", () => {
//                 res.download(filePath);
//             }).on("error", function (err) {
//                 console.log("Error: ", err.message);
//             });
//         });
//     });
// });

app.post("/buckets/download", function(req, res) {
    separator();
    const bucketID = req.body.bucketID;
    console.log("Bucket ID:", bucketID);
    const fileName = req.body.name;
    console.log("File Name:", fileName);
    client.listFilesInBucket(bucketID, function (err, files) {
        if (err) { return console.log("Error: ", err.message); }
        let fileList = files.find(function (file) {
            return file.filename.match(fileName);
        });
        const fileID = fileList.id;
        console.log("File ID:", fileID);
        const filePath = "./server/download/" + fileName;
        const target = fs.createWriteStream(filePath);
        const fileKey = getFileKey(STORJ_EMAIL, bucketID, fileName);
        client.createFileStream(bucketID, fileID, {exclude: []}, (err, stream) => {
            if (err) { return console.log("Error: ", err.message); }
            stream.on("error", (err) => {
                console.log("Failed to download shard: %s", [err.message]);
                fs.unlink(filePath, (unlinkFailed) => {
                    if (unlinkFailed) { return console.log("Error: ", err.message); }
                });
            }).pipe(target);
            target.on("finish", () => {
                res.download(filePath);
            }).on("error", function (err) {
                console.log("Error: ", err.message);
            });
        });
    });
});

app.get("/buckets/download/:id", function(req, res) {
    console.log(req.query, req.params);
    res.download(path.resolve(__dirname, "./", req.query));
});

// All remaining requests return the React app, so it can handle routing.
app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../react-ui/build", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    separator();
    console.log(`Listening on port ${PORT}`);
});
