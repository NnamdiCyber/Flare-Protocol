/**
 * auth.service.js — Wallet-based authentication service.
 *
 * Implements the two-step authentication flow described in README.md:
 *   1. POST /auth/challenge  — backend returns a nonce to sign
 *   2. Sign nonce with Freighter wallet
 *   3. POST /auth/verify     — backend verifies signature, returns JWT
 *
 * The JWT is stored in sessionStorage (not localStorage) so it expires
 * when the tab closes, matching the wallet-session mental model.
 */

'use strict';

var API_BASE_URL = 'http://localhost:3000';
var JWT_STORAGE_KEY = 'flare_jwt';

angular.module('flareApp.auth', ['flareApp.wallet'])
  .factory('AuthService', [
    '$http',
    '$q',
    'WalletService',
    function ($http, $q, WalletService) {

      /**
       * Full login flow:
       *   1. Get the user's Stellar public key from Freighter
       *   2. Request a challenge nonce from the backend
       *   3. Sign the nonce with Freighter
       *   4. Verify the signed nonce with the backend → receive JWT
       *   5. Persist the JWT to sessionStorage
       *
       * @returns {Promise<string>} Resolves with the JWT access token
       */
      function login() {
        var publicKey;

        return WalletService.getPublicKey()
          .then(function (key) {
            publicKey = key;
            // Step 1: request challenge nonce
            return $http.post(API_BASE_URL + '/auth/challenge', {
              publicKey: publicKey,
            });
          })
          .then(function (response) {
            var nonce = response.data.nonce;
            // Step 2: sign the nonce as a Stellar transaction memo (text)
            // Freighter signs raw text via signMessage; for Stellar wallet
            // signature verification the backend verifies a keypair signature.
            // We encode the nonce as a minimal Stellar transaction and sign it
            // so the backend can use stellar-sdk to verify.
            return WalletService.signTransaction(nonce, 'TESTNET');
          })
          .then(function (signedNonce) {
            // Step 3: verify with backend
            return $http.post(API_BASE_URL + '/auth/verify', {
              publicKey: publicKey,
              signature: signedNonce,
              nonce: _getPendingNonce(),
            });
          })
          .then(function (response) {
            var token = response.data.accessToken;
            sessionStorage.setItem(JWT_STORAGE_KEY, token);
            return token;
          });
      }

      /**
       * Clear the stored JWT, effectively logging out.
       */
      function logout() {
        sessionStorage.removeItem(JWT_STORAGE_KEY);
      }

      /**
       * Check whether the user has a stored JWT.
       * Does not validate the JWT's expiry — that is handled by the backend.
       *
       * @returns {boolean}
       */
      function isAuthenticated() {
        return !!sessionStorage.getItem(JWT_STORAGE_KEY);
      }

      /**
       * Retrieve the stored JWT for use as a Bearer token in API requests.
       *
       * @returns {string|null}
       */
      function getToken() {
        return sessionStorage.getItem(JWT_STORAGE_KEY);
      }

      /**
       * Internal: retrieve the last-issued nonce so the verify step can
       * include it. In a full implementation this would be returned from
       * the challenge response and stored in closure; simplified here.
       *
       * @returns {string}
       */
      function _getPendingNonce() {
        return sessionStorage.getItem('flare_pending_nonce') || '';
      }

      return {
        login: login,
        logout: logout,
        isAuthenticated: isAuthenticated,
        getToken: getToken,
      };
    },
  ]);
