"use strict";
exports.__esModule = true;
var shell = require("shelljs");
var path = require("path");
// Define source and destination paths
var filesToCopy = ['src/solana/my-new-keypair.json', 'src/solana/idl.json'];
var buildDirectory = 'build/solana';
// Copy each file to the build directory
filesToCopy.forEach(function (file) {
    var destPath = path.join(buildDirectory, path.basename(file));
    shell.cp(file, destPath);
    console.log("Copied ".concat(file, " to ").concat(destPath));
});
