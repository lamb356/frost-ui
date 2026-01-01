'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFrostStore } from '@/lib/store';
import { generateAuthKeyPair, hexToBytes, bytesToHex } from '@/lib/crypto';
import { saveAuthKeys } from '@/lib/crypto/keystore';

type SetupStep = 'welcome' | 'server' | 'keys' | 'password' | 'complete';

const STEPS: SetupStep[] = ['welcome', 'server', 'keys', 'password', 'complete'];

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [keyOption, setKeyOption] = useState<'generate' | 'import'>('generate');
  const [importedKey, setImportedKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedPubkey, setGeneratedPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store the generated keys temporarily until password is set
  const keysRef = useRef<{ publicKey: string; privateKey: string } | null>(null);

  const { setFrostdUrl, setAuthKeyPair, completeSetup } = useFrostStore();

  const currentStepIndex = STEPS.indexOf(currentStep);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
      setError(null);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
      setError(null);
    }
  }, [currentStepIndex]);

  const handleServerSubmit = () => {
    try {
      new URL(serverUrl);
      setFrostdUrl(serverUrl);
      goNext();
    } catch {
      setError('Please enter a valid URL');
    }
  };

  const handleKeyGeneration = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      if (keyOption === 'generate') {
        // Generate a new key pair using our crypto utilities
        const keys = await generateAuthKeyPair();
        keysRef.current = keys;
        setGeneratedPubkey(keys.publicKey);
      } else {
        // Validate and import key
        if (!importedKey || importedKey.length < 64) {
          throw new Error('Invalid key format. Please enter a valid hex-encoded private key.');
        }

        // Validate it's valid hex
        try {
          hexToBytes(importedKey);
        } catch {
          throw new Error('Invalid hex format. Please check your key.');
        }

        // For imported keys, we need to derive the public key
        // This is a simplified version - in production you'd properly derive it
        const privateKeyBytes = hexToBytes(importedKey);

        // Import as ECDSA key to get the public key
        const privateKey = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyBytes.buffer as ArrayBuffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign']
        );

        // Export to get the key pair details (this is a workaround)
        const exported = await crypto.subtle.exportKey('jwk', privateKey);

        // Reconstruct public key from JWK x,y coordinates
        const pubKeyJwk = {
          kty: exported.kty,
          crv: exported.crv,
          x: exported.x,
          y: exported.y,
        };

        const publicKey = await crypto.subtle.importKey(
          'jwk',
          pubKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );

        const publicKeyBuffer = await crypto.subtle.exportKey('raw', publicKey);
        const publicKeyHex = bytesToHex(new Uint8Array(publicKeyBuffer));

        keysRef.current = {
          publicKey: publicKeyHex,
          privateKey: importedKey,
        };
        setGeneratedPubkey(publicKeyHex);
      }

      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!keysRef.current) {
      setError('No keys to encrypt. Please go back and generate keys.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Save keys encrypted with password to localStorage
      await saveAuthKeys(keysRef.current, password);

      // Update Zustand store with public key info
      setAuthKeyPair(keysRef.current.publicKey, 'encrypted');

      // Clear the keys from memory
      keysRef.current = null;

      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save keys');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = () => {
    completeSetup();
    router.push('/');
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-xl mx-auto">
        {/* Progress indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-amber-500 text-gray-900'
                      : index === currentStepIndex
                      ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500'
                      : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-full h-1 mx-2 ${
                      index < currentStepIndex ? 'bg-amber-500' : 'bg-gray-800'
                    }`}
                    style={{ width: '60px' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {currentStep === 'welcome' && (
            <StepWelcome onNext={goNext} />
          )}

          {currentStep === 'server' && (
            <StepServer
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              error={error}
              onNext={handleServerSubmit}
              onBack={goBack}
            />
          )}

          {currentStep === 'keys' && (
            <StepKeys
              keyOption={keyOption}
              setKeyOption={setKeyOption}
              importedKey={importedKey}
              setImportedKey={setImportedKey}
              isGenerating={isGenerating}
              error={error}
              onNext={handleKeyGeneration}
              onBack={goBack}
            />
          )}

          {currentStep === 'password' && (
            <StepPassword
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              isSaving={isSaving}
              error={error}
              onNext={handlePasswordSubmit}
              onBack={goBack}
            />
          )}

          {currentStep === 'complete' && (
            <StepComplete
              pubkey={generatedPubkey}
              serverUrl={serverUrl}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Step Components
// =============================================================================

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
        <svg className="w-10 h-10 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">Welcome to FROST Multi-Sig</h2>
      <p className="text-gray-400 mb-8">
        This wizard will help you set up your FROST signing environment. You&apos;ll configure
        your server connection and generate authentication keys.
      </p>

      <div className="space-y-4 text-left mb-8">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-800/50">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold">1</span>
          </div>
          <div>
            <h4 className="font-medium text-white">Configure Server</h4>
            <p className="text-sm text-gray-500">Connect to a frostd coordination server</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-800/50">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold">2</span>
          </div>
          <div>
            <h4 className="font-medium text-white">Generate Auth Keys</h4>
            <p className="text-sm text-gray-500">Create keys for signing server challenges</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-800/50">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold">3</span>
          </div>
          <div>
            <h4 className="font-medium text-white">Set Password</h4>
            <p className="text-sm text-gray-500">Protect your keys with encryption</p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}

interface StepServerProps {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}

function StepServer({ serverUrl, setServerUrl, error, onNext, onBack }: StepServerProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Configure Server</h2>
      <p className="text-gray-400 mb-8">
        Enter the URL of your frostd coordination server.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Server URL
        </label>
        <input
          type="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://localhost:3000"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
      </div>

      <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 mb-8">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Common Options:</h4>
        <div className="space-y-2">
          <button
            onClick={() => setServerUrl('http://localhost:3000')}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            http://localhost:3000 <span className="text-gray-600">- Local development</span>
          </button>
          <button
            onClick={() => setServerUrl('https://frost.example.com')}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            https://frost.example.com <span className="text-gray-600">- Production</span>
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

interface StepKeysProps {
  keyOption: 'generate' | 'import';
  setKeyOption: (option: 'generate' | 'import') => void;
  importedKey: string;
  setImportedKey: (key: string) => void;
  isGenerating: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}

function StepKeys({
  keyOption,
  setKeyOption,
  importedKey,
  setImportedKey,
  isGenerating,
  error,
  onNext,
  onBack,
}: StepKeysProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Authentication Keys</h2>
      <p className="text-gray-400 mb-8">
        Generate new keys or import existing ones. These are used to authenticate with the server.
      </p>

      <div className="space-y-4 mb-8">
        <label
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
            keyOption === 'generate'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="keyOption"
            value="generate"
            checked={keyOption === 'generate'}
            onChange={() => setKeyOption('generate')}
            className="mt-1"
          />
          <div>
            <h4 className="font-medium text-white">Generate New Keys</h4>
            <p className="text-sm text-gray-500">
              Create a new ECDSA P-256 key pair using secure random generation
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
            keyOption === 'import'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="keyOption"
            value="import"
            checked={keyOption === 'import'}
            onChange={() => setKeyOption('import')}
            className="mt-1"
          />
          <div>
            <h4 className="font-medium text-white">Import Existing Key</h4>
            <p className="text-sm text-gray-500">
              Import a PKCS8-encoded private key in hex format
            </p>
          </div>
        </label>
      </div>

      {keyOption === 'import' && (
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Private Key (PKCS8 Hex)
          </label>
          <textarea
            value={importedKey}
            onChange={(e) => setImportedKey(e.target.value)}
            placeholder="Enter your private key in hex format..."
            rows={3}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono text-sm"
          />
          <p className="mt-2 text-xs text-gray-500">
            The key should be in PKCS8 format, hex-encoded.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={isGenerating || (keyOption === 'import' && !importedKey)}
          className="flex-1 py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {isGenerating ? 'Generating...' : keyOption === 'generate' ? 'Generate Keys' : 'Import Key'}
        </button>
      </div>
    </div>
  );
}

interface StepPasswordProps {
  password: string;
  setPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  isSaving: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}

function StepPassword({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  isSaving,
  error,
  onNext,
  onBack,
}: StepPasswordProps) {
  const passwordStrength = getPasswordStrength(password);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Set Password</h2>
      <p className="text-gray-400 mb-8">
        Create a password to encrypt your private keys. You&apos;ll need this to unlock your keys.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a strong password"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full ${
                      level <= passwordStrength.level
                        ? passwordStrength.level <= 1
                          ? 'bg-red-500'
                          : passwordStrength.level <= 2
                          ? 'bg-yellow-500'
                          : passwordStrength.level <= 3
                          ? 'bg-blue-500'
                          : 'bg-green-500'
                        : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs ${
                passwordStrength.level <= 1
                  ? 'text-red-400'
                  : passwordStrength.level <= 2
                  ? 'text-yellow-400'
                  : passwordStrength.level <= 3
                  ? 'text-blue-400'
                  : 'text-green-400'
              }`}>
                {passwordStrength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-400">{error}</p>
      )}

      <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-8">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-medium text-yellow-400">Important</h4>
            <p className="text-sm text-yellow-400/70">
              Your keys will be encrypted with AES-256-GCM using PBKDF2 key derivation.
              If you forget this password, you will not be able to recover your keys.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="flex-1 py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={isSaving || password.length < 8 || password !== confirmPassword}
          className="flex-1 py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {isSaving ? 'Encrypting Keys...' : 'Set Password'}
        </button>
      </div>
    </div>
  );
}

interface StepCompleteProps {
  pubkey: string | null;
  serverUrl: string;
  onComplete: () => void;
}

function StepComplete({ pubkey, serverUrl, onComplete }: StepCompleteProps) {
  const [copied, setCopied] = useState(false);

  const copyPubkey = async () => {
    if (pubkey) {
      await navigator.clipboard.writeText(pubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">Setup Complete!</h2>
      <p className="text-gray-400 mb-8">
        Your FROST Multi-Sig environment is ready to use. Your keys have been securely encrypted and stored.
      </p>

      <div className="space-y-4 text-left mb-8">
        <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-1">Server</h4>
          <p className="font-mono text-amber-400 text-sm break-all">{serverUrl}</p>
        </div>

        <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-gray-400 mb-1">Your Public Key</h4>
              <p className="font-mono text-amber-400 text-xs break-all">
                {pubkey}
              </p>
            </div>
            <button
              onClick={copyPubkey}
              className="flex-shrink-0 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              title="Copy public key"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <h4 className="font-medium text-green-400">Keys Secured</h4>
              <p className="text-sm text-green-400/70">
                Your private key is encrypted with AES-256-GCM and stored locally.
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onComplete}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getPasswordStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: '' };

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Weak' };
  if (score <= 2) return { level: 2, label: 'Fair' };
  if (score <= 3) return { level: 3, label: 'Good' };
  return { level: 4, label: 'Strong' };
}
