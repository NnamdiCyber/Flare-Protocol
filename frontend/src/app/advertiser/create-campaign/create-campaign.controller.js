/**
 * create-campaign.controller.js — Campaign creation wizard controller.
 *
 * Presents a form shell for creating a new Flare Protocol campaign.
 * Full on-chain submission (Soroban create_campaign + asset deposit) is
 * wired up post Day 5. The form fields mirror the Campaign struct from
 * the campaign_manager contract exactly.
 */

'use strict';

angular.module('flareApp.advertiser')
  .controller('CreateCampaignCtrl', [
    '$scope',
    'WalletService',
    function ($scope, WalletService) {

      // Campaign form model — mirrors Campaign struct in README.md
      $scope.campaign = {
        campaignType: 'Referral',
        asset: '',               // Stellar asset contract address (SEP-0041)
        rewardPerAction: null,   // in stroops (1 XLM = 10,000,000 stroops)
        totalBudget: null,       // in stroops
        maxParticipants: null,
        expiry: null,            // ISO date string → converted to Unix timestamp on submit
        minProofThreshold: 0,    // % for learn-to-earn; follower count for social
        metadataUri: '',         // IPFS or Arweave URI for campaign details / ad creative
        oraclePubkey: '',        // oracle ed25519 public key (from /oracle/pubkey)
      };

      $scope.campaignTypes = ['Referral', 'Social', 'LearnToEarn', 'AdAttention'];
      $scope.submitting = false;
      $scope.submitted = false;
      $scope.error = null;
      $scope.walletAddress = null;

      WalletService.isConnected()
        .then(function (connected) {
          if (connected) return WalletService.getPublicKey();
        })
        .then(function (key) {
          if (key) $scope.walletAddress = key;
        })
        .catch(angular.noop);

      /**
       * Submit form — stub.
       * Full implementation (build Soroban create_campaign transaction,
       * sign with Freighter, submit to RPC) is wired post Day 5.
       */
      $scope.submit = function () {
        if (!$scope.walletAddress) {
          $scope.error = 'Please connect your wallet first.';
          return;
        }
        $scope.submitting = true;
        $scope.error = null;

        // TODO (post Day 5): build Soroban tx, sign via WalletService.signTransaction,
        // submit via StellarService.submitTransaction
        setTimeout(function () {
          $scope.submitting = false;
          $scope.submitted = true;
          $scope.$apply();
        }, 500);
      };
    },
  ]);
