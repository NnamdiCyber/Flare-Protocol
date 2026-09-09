/**
 * stellar.service.js — Stellar SDK integration service.
 *
 * Wraps @stellar/stellar-sdk for on-chain interactions:
 * - Fetching campaigns from the backend API
 * - Submitting signed Stellar transactions to the RPC
 *
 * All Soroban contract calls go through the NestJS backend REST API
 * (which uses the Stellar SDK server-side). Direct on-chain contract
 * invocations from the frontend are handled here only for transaction
 * submission (earner claims).
 */

'use strict';

// Backend API base URL — in production this comes from a build-time constant
var API_BASE_URL = 'http://localhost:3000';

// Stellar RPC URL for transaction submission
var STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';

angular.module('flareApp.stellar', ['flareApp.wallet'])
  .factory('StellarService', [
    '$http',
    '$q',
    'WalletService',
    function ($http, $q, WalletService) {

      /**
       * Retrieve all active campaigns from the backend API.
       * The backend queries the Soroban campaign_manager contract.
       *
       * @returns {Promise<Array>} Array of campaign objects
       */
      function getCampaigns() {
        return $http.get(API_BASE_URL + '/campaigns')
          .then(function (response) {
            return response.data;
          });
      }

      /**
       * Retrieve a single campaign by its ID.
       *
       * @param {string} id - Campaign ID (hex-encoded 32-byte BytesN)
       * @returns {Promise<Object>} Campaign object
       */
      function getCampaign(id) {
        return $http.get(API_BASE_URL + '/campaigns/' + id)
          .then(function (response) {
            return response.data;
          });
      }

      /**
       * Retrieve participation statistics for a campaign.
       *
       * @param {string} id - Campaign ID
       * @returns {Promise<Object>} Stats object { participants, totalPaid, remaining }
       */
      function getCampaignStats(id) {
        return $http.get(API_BASE_URL + '/campaigns/' + id + '/stats')
          .then(function (response) {
            return response.data;
          });
      }

      /**
       * Submit a signed transaction XDR to the Stellar network via RPC.
       * Used when the earner submits a ClaimProof transaction on-chain.
       *
       * @param {string} signedXdr - Base64-encoded signed transaction XDR
       * @returns {Promise<Object>} Transaction result from Stellar RPC
       */
      function submitTransaction(signedXdr) {
        var deferred = $q.defer();

        // POST the signed XDR to the Stellar RPC sendTransaction endpoint
        $http.post(STELLAR_RPC_URL, {
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: { transaction: signedXdr },
        }).then(function (response) {
          var result = response.data;
          if (result.error) {
            deferred.reject(new Error(result.error.message || 'RPC error'));
          } else {
            deferred.resolve(result.result);
          }
        }).catch(function (err) {
          deferred.reject(err);
        });

        return deferred.promise;
      }

      return {
        getCampaigns: getCampaigns,
        getCampaign: getCampaign,
        getCampaignStats: getCampaignStats,
        submitTransaction: submitTransaction,
      };
    },
  ]);
