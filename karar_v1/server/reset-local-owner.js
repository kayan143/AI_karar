import dotenv from 'dotenv';
import { emitKeypressEvents } from 'node:readline';
import { initializeLocalAuth, resetLocalOwnerPassword } from './local-auth.js';

dotenv.config();

function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal.');
  }
  emitKeypressEvents(input);
  process.stdout.write(prompt);
  input.resume();
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      input.removeListener('keypress', onKeyPress);
      input.setRawMode(wasRaw);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeyPress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Password reset cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (character && !key.ctrl && !key.meta) value += character;
    };
    input.on('keypress', onKeyPress);
  });
}

try {
  await initializeLocalAuth();
  const password = await readHidden('New owner password (12+ characters): ');
  const confirmation = await readHidden('Confirm new owner password: ');
  if (password !== confirmation) throw new Error('The passwords do not match.');
  await resetLocalOwnerPassword(password);
  console.log('Owner password updated. All existing account sessions were signed out.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The owner password could not be reset.');
  process.exitCode = 1;
}
