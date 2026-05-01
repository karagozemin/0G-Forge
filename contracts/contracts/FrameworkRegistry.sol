// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FrameworkRegistry
 * @notice On-chain registry for 0G Forge framework deployments and project sync state.
 *         Deployed on 0G Chain (EVM-compatible L1).
 *
 * Two responsibilities:
 *   1. Framework registration — lets builders publish a named framework entry on-chain.
 *   2. Sync hash storage    — maps a project key to its latest 0G Storage file hash,
 *                             so `og sync push/pull` can operate across machines.
 */
contract FrameworkRegistry {
    struct FrameworkEntry {
        string name;
        string version;
        string repoUrl;
        address registrant;
        uint256 registeredAt;
    }

    mapping(address => FrameworkEntry) private _frameworks;
    mapping(string => string) private _syncHashes;

    address[] private _registrants;

    event FrameworkRegistered(
        address indexed registrant,
        string name,
        string version,
        string repoUrl
    );

    event SyncHashUpdated(
        string indexed projectKey,
        string fileHash,
        address indexed updater
    );

    // ── Framework registration ────────────────────────────────────────────────

    function registerFramework(
        string calldata name,
        string calldata version,
        string calldata repoUrl
    ) external {
        require(bytes(name).length > 0, "name required");
        require(bytes(version).length > 0, "version required");

        bool isNew = bytes(_frameworks[msg.sender].name).length == 0;

        _frameworks[msg.sender] = FrameworkEntry({
            name: name,
            version: version,
            repoUrl: repoUrl,
            registrant: msg.sender,
            registeredAt: block.timestamp
        });

        if (isNew) {
            _registrants.push(msg.sender);
        }

        emit FrameworkRegistered(msg.sender, name, version, repoUrl);
    }

    function getFramework(address registrant)
        external
        view
        returns (FrameworkEntry memory)
    {
        return _frameworks[registrant];
    }

    function getRegistrantCount() external view returns (uint256) {
        return _registrants.length;
    }

    function getRegistrantAt(uint256 index) external view returns (address) {
        require(index < _registrants.length, "index out of bounds");
        return _registrants[index];
    }

    // ── Sync hash storage ─────────────────────────────────────────────────────

    function setSyncHash(string calldata projectKey, string calldata fileHash)
        external
    {
        require(bytes(projectKey).length > 0, "projectKey required");
        require(bytes(fileHash).length > 0, "fileHash required");

        _syncHashes[projectKey] = fileHash;

        emit SyncHashUpdated(projectKey, fileHash, msg.sender);
    }

    function getSyncHash(string calldata projectKey)
        external
        view
        returns (string memory)
    {
        return _syncHashes[projectKey];
    }
}
