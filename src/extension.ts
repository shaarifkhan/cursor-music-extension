import * as vscode from 'vscode';
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cursor Agent Music');
  output.appendLine('Cursor Agent Music activated.');
  context.subscriptions.push(output);
}

export function deactivate(): void {
  // Nothing to dispose yet.
}
