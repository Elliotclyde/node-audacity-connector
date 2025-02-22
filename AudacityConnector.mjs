import { spawn } from 'child_process';
import * as fs from 'fs';
import { connect } from 'net';


// Paths to the named pipes
const commandPipePath = '\\\\.\\pipe\\ToSrvPipe';
const responsePipePath = '\\\\.\\pipe\\FromSrvPipe'
const EOL = '\r\n\0'
const openAudacityTimeOut = 10_000;
const responsePipeTimeOut = 30_000;
const leaveOpenAfterCommands = false;

var child;

export function openAudacity() {
    return new Promise((resolve, reject) => {
        child = spawn('C:\\Program Files\\Audacity\\Audacity.exe', [], {
            detached: leaveOpenAfterCommands,
            stdio: ['ignore', 'ignore', 'ignore']
        });
        if (leaveOpenAfterCommands) {
            child.unref();
        }

        let currentResponseTime = 0;
        let lastTime = performance.now();

        let index = 0;
        let isFound = false
        function pollForCommandPipe() {
            setTimeout(() => {
                if (isFound) {
                    return;
                }
                if (currentResponseTime > openAudacityTimeOut) {
                    console.log('Audacity did not open')
                    reject('Audacity did not open')
                }
                let client = connect(commandPipePath)
                client.on('error', () => {
                    console.log('not open yet')
                })
                isFound = true;
                client.end();
                setTimeout(() => {
                    resolve()
                }, 3000)
            }, 500)

            currentResponseTime = currentResponseTime + (performance.now() - lastTime);
            lastTime = performance.now();
            index++;
        }
        pollForCommandPipe();
    })
}

export function closeAudacity() {
    child.kill()
}

export async function sendCommandToAudacity(command) {
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
                    const response = await readFromResponsePipe();
                    console.log(response)
                    resolve(response);

                });
            });
        });
    });
}

function readFromResponsePipe() {
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
            }, responsePipeTimeOut)
            readMoreRecursive();
        })
    })
}

