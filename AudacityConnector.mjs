import { spawn, exec } from 'child_process';
import * as fs from 'fs';

// Paths to the named pipes

const commandPipePath = '\\\\.\\pipe\\ToSrvPipe';
const responsePipePath = '\\\\.\\pipe\\FromSrvPipe'

const openAudacityTimeOut = 10_000;
const audacityStartUpTime = 5_000;
const leaveOpenAfterCommands = false;

var child;

const defaultOptions = {
    audacityLocation: 'C:\\Program Files\\Audacity\\Audacity.exe',
    commandTimeOut: 30_000
}

export class AudacityConnector {

    constructor(options) {
        this.options = { ...defaultOptions, ...options };

    }
    openAudacity() {
        return new Promise((resolve, reject) => {
            child = spawn(this.options.audacityLocation, [], {
                detached: false,
                stdio: ['ignore', 'ignore', 'ignore']
            });

            let currentResponseTime = 0;
            let lastTime = performance.now();
            let isFound = false
            function pollForAudacity() {
                setTimeout(() => {
                    if (isFound) {
                        return;
                    }
                    if (currentResponseTime > openAudacityTimeOut) {
                        console.log('Audacity did not open')
                        reject('Audacity did not open')
                    }


                    exec('tasklist', (err, stdout, stderr) => {
                        if (err) {
                            return reject(`Error executing tasklist: ${err}`);
                        }
                        if (stderr) {
                            return reject(`Error: ${stderr}`);
                        }

                        // Check if the output contains "audacity.exe"
                        if (stdout.toLowerCase().includes('audacity.exe')) {
                            isFound = true;
                            setTimeout(() => {
                                resolve()
                            }, audacityStartUpTime)
                        }
                        currentResponseTime = currentResponseTime + (performance.now() - lastTime);
                        lastTime = performance.now();
                    })
                }, 500)
            }
            pollForAudacity();
        })
    }
    closeAudacity() {
        child.kill()
    }

    sendCommandToAudacity(command) {
        return new Promise((resolve, reject) => {
            // Open the command pipe for writing
            fs.open(commandPipePath, 'w', (err, commandFd) => {
                if (err) {
                    return reject(`Error opening command pipe: ${err}`);
                }

                // Write the command to the command pipe
                fs.write(commandFd, command, (err) => {
                    if (err) {
                        fs.close(commandFd, () => { }); // Close the file descriptor on error
                        return reject(`Error writing to command pipe: ${err}`);
                    }

                    // Close the command pipe after writing
                    fs.close(commandFd, async (err) => {
                        if (err) {
                            return reject(`Error closing command pipe: ${err}`);
                        }
                        const response = await this.readFromResponsePipe();
                        console.log(response)
                        resolve(response);

                    });
                });
            });
        });
    }

    readFromResponsePipe() {
        return new Promise((resolve, reject) => {
            // Open the response pipe for reading
            let responseString = ''
            fs.open(responsePipePath, 'r', (err, responseFd) => {
                if (err) {
                    return reject(`Error opening response pipe: ${err}`);
                }

                function readMoreRecursive() {
                    if (responseString.trim() !== '') {
                        // If the response we get back is empty, close the pipe and resolve:
                        fs.close(responseFd, (err) => {
                            if (err) {
                                return reject(`Error closing response pipe: ${err}`);
                            }
                            // Resolve with the response data
                            resolve(responseString);
                        });
                        return;
                    }
                    const buffer = Buffer.alloc(4096);
                    fs.read(responseFd, buffer, 0, buffer.length, null, (err, bytesRead) => {
                        if (err) {
                            fs.close(responseFd, () => { });
                            return reject(`Error reading from response pipe: ${err}`);
                        }
                        responseString = buffer.toString('utf8', 0, bytesRead);
                        readMoreRecursive()
                    });
                }
                setTimeout(() => {
                    fs.close(responseFd, () => { });
                    resolve()
                }, this.options.commandTimeOut)
                readMoreRecursive();
            })
        })
    }
}