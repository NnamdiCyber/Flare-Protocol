/**
 * wallet.service.js — Freighter wallet integration service.
 *
 * Wraps the @stellar/freighter-api browser extension API and exposes
 * a clean AngularJS factory for use across the application.
 *
 * Freighter is the primary Stellar wallet browser extension.
 * Docs: https://docs.freighter.app/
 */

'use strict';

// freighter-api is bundled via webpack from node_modules
const freighterApi = require('@stellar/freighter-api');

angular.module('flareApp.wallet', [])
  .factory('WalletService', [
    '$q',
    function ($q) {

      /**
       * Request wallet access from Freighter.
       * The user will see a Freighter popup asking for permission.
       *
       * @returns {Promise<void>}
       */
      function connect() {
        var deferred = $q.defer();
        freighterApi.requestAccess()
          .then(function (result) {
            if (result.error) {
              deferred.reject(new Error(result.error));
            } else {
              deferred.resolve();
            }
          })
          .catch(function (err) {
            deferred.reject(err);
          });
        return deferred.promise;
      }

      /**
       * Check whether Freighter is installed and the user has granted access.
       *
       * @returns {Promise<boolean>}
       */
      function isConnected() {
        var deferred = $q.defer();
        freighterApi.isConnected()
          .then(function (result) {
            // result may be { isConnected: boolean } or boolean depending on version
            var connected = (typeof result === 'object')
              ? result.isConnected
              : !!result;
            deferred.resolve(connected);
          })
          .catch(function () {
            deferred.resolve(false);
          });
        return deferred.promise;
      }

      /**
       * Retrieve the user's Stellar public key (G... address) from Freighter.
       *
       * @returns {Promise<string>} Stellar public key (56-char G... string)
       */
      function getPublicKey() {
        var deferred = $q.defer();
        freighterApi.getPublicKey()
          .then(function (result) {
            if (result.error) {
              deferred.reject(new Error(result.error));
            } else {
              // result may be the key directly or { publicKey: string }
              var key = (typeof result === 'object' && result.publicKey)
                ? result.publicKey
                : result;
              deferred.resolve(key);
            }
          })
          .catch(function (err) {
            deferred.reject(err);
          });
        return deferred.promise;
      }

      /**
       * Sign a Stellar transaction XDR with the connected wallet.
       *
       * @param {string} xdr     - Base64-encoded transaction XDR
       * @param {string} network - Network name, e.g. "TESTNET" or "PUBLIC"
       * @returns {Promise<string>} Signed XDR
       */
      function signTransaction(xdr, network) {
        var deferred = $q.defer();
        freighterApi.signTransaction(xdr, { network: network })
          .then(function (result) {
            if (result.error) {
              deferred.reject(new Error(result.error));
            } else {
              var signedXdr = (typeof result === 'object' && result.signedTxXdr)
                ? result.signedTxXdr
                : result;
              deferred.resolve(signedXdr);
            }
          })
          .catch(function (err) {
            deferred.reject(err);
          });
        return deferred.promise;
      }

      return {
        connect: connect,
        isConnected: isConnected,
        getPublicKey: getPublicKey,
        signTransaction: signTransaction,
      };
    },
  ]);
