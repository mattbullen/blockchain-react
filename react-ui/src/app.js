// Import browser polyfills.
import "./app.polyfills.js";
import "babel-polyfill";

// React imports.
import React from "react";

// App CSS
import './app.css';

// This plugin handles updating data state from DOM --> App.
import update from "react-addons-update";

// Needed for onTouchTap.
// https://github.com/callemall/material-ui
// https://github.com/callemall/material-ui/issues/5396
// http://stackoverflow.com/a/34015469/988941
import injectTapEventPlugin from "react-tap-event-plugin";
injectTapEventPlugin();

// Fetch polyfills.
import fetch from "isomorphic-fetch";
import "es6-promise/auto";
import serialize from "serialize-javascript";

// Material UI theme manager. It seems to prefer receiving an anonymous object literal
// instead of a reference to a configuration object from the app.config.js file.
import MuiThemeProvider from "material-ui/styles/MuiThemeProvider";
import getMuiTheme from "material-ui/styles/getMuiTheme";
const muiTheme = getMuiTheme({
    fontFamily: "Rubik, Arial, sans-serif",
    raisedButton: {
        primaryColor: "#448aff",
        secondaryColor: "#448aff"
    }
});

// File picker
import Dropzone from "react-dropzone";

// Base class for the entire app.
class App extends React.PureComponent {

    constructor(props) {
        super(props);

        this.state = {
            all: [],
            delete: {
                bucketID: "a03a347be846831eb294d1f1"
            },
            upload: {
                bucketID: "",
                disabled: true,
                dropzoneClass: "dropzone-disabled",
                name: ""
            }
        };

        this.createBucket = this.createBucket.bind(this);
        this.deleteBucket = this.deleteBucket.bind(this);
        this.setUploadBucket = this.setUploadBucket.bind(this);
        this.uploadFile = this.uploadFile.bind(this);
    }

    // Called after the first DOM render. Only called once.
    componentDidMount() {
        this.__authenticateStorj();
        this.__getBucketFiles();
    }

    // Authenticate with Storj
    __authenticateStorj() {
        fetch(
            "/user/authenticate"
        ).then((res) => {
            console.log("\nApp.__authenticateStorj() GET:", res.statusText);
        }).catch((error) => {
            console.log("\nApp.__authenticateStorj() GET:", error);
        });
    }

    // Get a list of all record buckets
    __getBucketFiles() {
        const app = this;
        fetch(
            "/buckets/all"
        ).then((res) => {
            if (res && res.ok) {
                res.json().then((json) => {
                    let list = [];
                    Object.keys(json).map((key) => {
                        json[key].bucketName = key;
                        list.push(json[key]);
                    });
                    list = list.sort((a, b) => { return a.name === b.name ? 0 : a.name > b.name || -1; });
                    let newState;
                    if (list.length === 0) {
                        newState = update(app.state, {
                            all: { $set: list },
                            upload: {
                                disabled: { $set: true },
                                dropzoneClass: { $set: "dropzone-disabled" }
                            }
                        });
                    } else {
                        newState = update(app.state, {
                            all: { $set: list }
                        });
                    }
                    app.setState(newState, () => {
                        console.log("\nApp.getBucketFiles() GET:", this.state);
                    });
                });
            } else {
                console.log("\nApp.__getBucketFiles() GET:", res);
            }
        }).catch((error) => {
            console.log("\nApp.__getBucketFiles() GET:", error);
        });
    }

    // Add a new bucket for records
    createBucket() {
        const app = this;
        const input = document.getElementById("newBucketName");
        const name = input.value;
        if (!name || name === "") { return; }
        fetch(
            "/buckets/create",
            {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                mode: "cors",
                body: serialize({ name: name }, { isJSON: true })
            }
        ).then((res) => {
            if (res && res.ok) {
                res.json().then((json) => {
                    console.log("\nApp.createBucket() POST:", json);
                    input.value = "";
                    app.__getBucketFiles();
                });
            } else {
                console.log("\nApp.createBucket() POST:", res);
            }
        }).catch((error) => {
            console.log("\nApp.createBucket() POST:", error);
        });
    }

    // Find an object's index in an array by a key's value.
    __arrayIndexMap(array, key, value) {
        return array.map((x) => { return x[key]; }).indexOf(value);
    }

    // Delete an existing bucket
    deleteBucket() {
        const app = this;
        const input = document.getElementById("deleteBucketName");
        const name = input.value;
        if (!name || name === "") { return; }
        const index = app.__arrayIndexMap(this.state.all, "name", name);
        if (index === -1) { return; }
        const id = this.state.all[index].id;
        if (!id) { return; }
        fetch(
            "/buckets/delete",
            {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                mode: "cors",
                body: serialize({ bucketID: id }, { isJSON: true })
            }
        ).then((res) => {
            if (res && res.ok) {
                console.log("\nApp.deleteBucket() POST:", res);
                input.value = "";
                app.__getBucketFiles();
            } else {
                console.log("\nApp.deleteBucket() POST:", res);
            }
        }).catch((error) => {
            console.log("\nApp.deleteBucket() POST:", error);
        });
    }

    uploadFileBC(acceptedFiles, rejectedFiles) {
        const app = this;
        const reader = new FileReader();
        let name;
        if (!this.state.upload.name || this.state.upload.name === "") {
            name = "File_" + Math.round(Math.random() * 10000) + ".txt";
        } else if (this.state.upload.name.indexOf(".") === -1) {
            name = this.state.upload.name + ".txt";
        } else {
            name = this.state.upload.name;
        }
        reader.onload = () => {
            fetch(
                "/buckets/upload",
                {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    mode: "cors",
                    body: serialize({
                        bucketID: this.state.upload.bucketID,
                        file: reader.result,
                        type: acceptedFiles[0].type,
                        name: name
                    }, { isJSON: true })
                }
            ).then((res) => {
                if (res && res.ok) {
                    res.json().then((json) => {
                        const newState = update(this.state, {
                            upload: {
                                name: { $set: "" }
                            }
                        });
                        this.setState(newState, () => {
                            console.log("\nApp.uploadFile() POST:", json);
                            app.__getBucketFiles();
                        });
                    });
                } else {
                    console.log("\nApp.uploadFile() POST:", res);
                }
            }).catch((error) => {
                console.log("\nApp.uploadFile() POST:", error);
            });
        };
        reader.onabort = (err) => console.log("\nApp.uploadFile(aborted):", err);
        reader.onerror = (err) => console.log("\nApp.uploadFile(failed):", err);
        reader.readAsBinaryString(acceptedFiles[0]);
        if (rejectedFiles.length > 0) {
            console.log("\nApp.uploadFile(rejected):", rejectedFiles);
        }
    }

    uploadFile(acceptedFiles, rejectedFiles) {
        const app = this;
        const reader = new FileReader();
        let name;
        if (!this.state.upload.name || this.state.upload.name === "") {
            name = "File_" + Math.round(Math.random() * 10000) + ".txt";
        } else if (this.state.upload.name.indexOf(".") === -1) {
            name = this.state.upload.name + ".txt";
        } else {
            name = this.state.upload.name;
        }
        reader.onload = () => {
            fetch(
                "/buckets/upload",
                {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    mode: "cors",
                    body: serialize({
                        bucketID: this.state.upload.bucketID,
                        file: reader.result,
                        type: acceptedFiles[0].type,
                        name: acceptedFiles[0].name
                    }, { isJSON: true })
                }
            ).then((res) => {
                if (res && res.ok) {
                    res.json().then((json) => {
                        const newState = update(this.state, {
                            upload: {
                                name: { $set: "" }
                            }
                        });
                        this.setState(newState, () => {
                            console.log("\nApp.uploadFile() POST:", json);
                            app.__getBucketFiles();
                        });
                    });
                } else {
                    console.log("\nApp.uploadFile() POST:", res);
                }
            }).catch((error) => {
                console.log("\nApp.uploadFile() POST:", error);
            });
        };
        reader.onabort = (err) => console.log("\nApp.uploadFile(aborted):", err);
        reader.onerror = (err) => console.log("\nApp.uploadFile(failed):", err);
        reader.readAsBinaryString(acceptedFiles[0]);
        if (rejectedFiles.length > 0) {
            console.log("\nApp.uploadFile(rejected):", rejectedFiles);
        }
    }

    setUploadBucket(e) {
        e.persist();
        e.preventDefault();
        e.stopPropagation();
        const newState = update(this.state, {
            upload: {
                bucketID: { $set: e.target.dataset.bucket },
                disabled: { $set: false },
                dropzoneClass: { $set: "dropzone" }
            }
        });
        this.setState(newState, () => {
            console.log("\nApp.setUploadBucket():", this.state);
        });
    }

    // Main rendering routine containing the app view DOM template.
    // Note that Material UI components need to be individually wrapped in <MuiThemeProvider muiTheme={muiTheme}> wrapper elements.
    render() {

        return (

            <div id="app">

                <h1 className="center">Veterinarian View</h1>

                <div className="left">

                    <h3>{"Add a Folder"}</h3>

                    <div className="row">

                        <input id="newBucketName"/>
                        <button onClick={this.createBucket}>
                            {"Add"}
                        </button>

                    </div>

                    <h3>{"Delete a Folder"}</h3>

                    <div className="row-marginless">

                        <input
                            id="deleteBucketName"
                            placeholder="Enter the folder's full name"
                        />
                        <button onClick={this.deleteBucket}>
                            {"Delete"}
                        </button>

                    </div>

                    <div className="row">

                        <div className="sub-left">

                            <h3>{"Select to Upload"}</h3>

                            <div className="radio-column">

                                {this.state.all.length === 0 &&
                                    <em>{"Please add a folder to upload files."}</em>
                                }

                                {this.state.all.map((item, i) => {
                                    return (
                                        <div key={i} className="radio-row">
                                            <input
                                                name="bucket-selection"
                                                className="radio-button"
                                                type="radio"
                                                data-bucket={item.id}
                                                onTouchTap={this.setUploadBucket}
                                            />
                                            <label
                                                name="bucket-selection"
                                                className="radio-label"
                                            >
                                                {item.bucketName}
                                            </label>
                                        </div>
                                    );
                                })}
                                <br/>
                            </div>

                        </div>

                        <div className="sub-right">

                            <h3>File Drop</h3>

                            <Dropzone
                                className={this.state.upload.dropzoneClass}
                                disabled={this.state.upload.disabled}
                                accept=".jpeg,.png,.pdf,.doc,.docx,.txt,.csv,.tsv"
                                onDrop={this.uploadFile}
                            />
                        </div>

                    </div>

                </div>

                <div className="right">

                    {this.state.all.map((item, i) => {
                        return (
                            <div key={i}>
                                {item.files.length === 1 &&
                                <div className="bucket">
                                    {item.name + ": " + item.files.length + " file"}
                                </div>
                                }
                                {item.files.length !== 1 &&
                                <div className="bucket">
                                    {item.name + ": " + item.files.length + " files"}
                                </div>
                                }
                                {item.files.map((file, i) => {
                                    let s3 = file.filename.split(".");
                                    s3.splice(s3.length - 1, 1);
                                    s3 = s3.join(".");
                                    let display = s3.substring(6, s3.length);
                                    return (
                                        <div key={i} className="file-wrapper">
                                            <a href={"https://s3-us-west-2.amazonaws.com/bcvets/" + file.bucket + "/" + s3} target = "_blank" className="file">
                                                {file.id + " - " + file.mimetype + " - " + display}
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

            </div>
        );
    }
}

// Exports the finalized app as a component for use in the index.js file.
export default App;