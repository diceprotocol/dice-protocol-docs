// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {DiceEventsV2} from "./DiceEventsV2.sol";
import {DiceStructsV2} from "./DiceStructsV2.sol";

/// @notice V2 interface for Dice Protocol — the commit-reveal randomness oracle.
/// Dice Protocol component.
interface IEntropyV2 is DiceEventsV2 {
    /// @notice Request a random number using the default provider with default gas limit
    /// @return assignedSequenceNumber A unique identifier for this request
    function requestV2() external payable returns (uint64 assignedSequenceNumber);

    /// @notice Request a random number using the default provider with specified gas limit
    /// @param gasLimit The gas limit for the callback function
    /// @return assignedSequenceNumber A unique identifier for this request
    function requestV2(uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber);

    /// @notice Request a random number from a specific provider with specified gas limit
    /// @param provider The address of the provider to request from
    /// @param gasLimit The gas limit for the callback function
    /// @return assignedSequenceNumber A unique identifier for this request
    function requestV2(address provider, uint32 gasLimit)
        external
        payable
        returns (uint64 assignedSequenceNumber);

    /// @notice Request a random number from a specific provider with a user-provided random number and gas limit
    /// @param provider The address of the provider to request from
    /// @param userRandomNumber A random number provided by the user for additional entropy
    /// @param gasLimit The gas limit for the callback function. Pass 0 for provider default.
    /// @return assignedSequenceNumber A unique identifier for this request
    function requestV2(address provider, bytes32 userRandomNumber, uint32 gasLimit)
        external
        payable
        returns (uint64 assignedSequenceNumber);

    /// @notice Get information about a specific provider
    function getProviderInfoV2(address provider)
        external
        view
        returns (DiceStructsV2.ProviderInfo memory info);

    /// @notice Get the address of the default provider
    function getDefaultProvider() external view returns (address provider);

    /// @notice Get information about a specific request
    function getRequestV2(address provider, uint64 sequenceNumber)
        external
        view
        returns (DiceStructsV2.Request memory req);

    /// @notice Get the fee charged by the default provider for the default gas limit
    function getFeeV2() external view returns (uint128 feeAmount);

    /// @notice Get the fee charged by the default provider for a specific gas limit
    function getFeeV2(uint32 gasLimit) external view returns (uint128 feeAmount);

    /// @notice Get the fee charged by a specific provider for a request with a given gas limit
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint128 feeAmount);
}
