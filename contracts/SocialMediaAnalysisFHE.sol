// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocialMediaAnalysisFHE is SepoliaConfig {
    struct EncryptedPost {
        uint256 postId;
        euint32 encryptedContent;    // Encrypted post content
        euint32 encryptedSentiment;  // Encrypted sentiment score
        euint32 encryptedKeywords;   // Encrypted threat keywords
        uint256 timestamp;
    }

    struct EncryptedAnalysis {
        uint256 analysisId;
        euint32 encryptedThreatScore;  // Encrypted threat assessment
        euint32 encryptedUrgency;      // Encrypted urgency level
        uint256 postId;
        uint256 analyzedAt;
    }

    struct DecryptedResult {
        uint32 threatScore;
        uint32 urgency;
        bool isRevealed;
    }

    uint256 public postCount;
    uint256 public analysisCount;
    mapping(uint256 => EncryptedPost) public encryptedPosts;
    mapping(uint256 => EncryptedAnalysis) public encryptedAnalyses;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    mapping(uint256 => uint256) private requestToPostId;
    mapping(uint256 => uint256) private analysisRequestToId;
    
    event PostSubmitted(uint256 indexed postId, uint256 timestamp);
    event AnalysisRequested(uint256 indexed requestId, uint256 postId);
    event AnalysisCompleted(uint256 indexed analysisId);
    event ResultDecrypted(uint256 indexed analysisId);

    modifier onlyAuthorized() {
        // Add proper authorization logic in production
        _;
    }

    function submitEncryptedPost(
        euint32 encryptedContent,
        euint32 encryptedSentiment,
        euint32 encryptedKeywords
    ) public onlyAuthorized {
        postCount += 1;
        uint256 newPostId = postCount;
        
        encryptedPosts[newPostId] = EncryptedPost({
            postId: newPostId,
            encryptedContent: encryptedContent,
            encryptedSentiment: encryptedSentiment,
            encryptedKeywords: encryptedKeywords,
            timestamp: block.timestamp
        });
        
        emit PostSubmitted(newPostId, block.timestamp);
    }

    function requestThreatAnalysis(uint256 postId) public onlyAuthorized {
        EncryptedPost storage post = encryptedPosts[postId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(post.encryptedContent);
        ciphertexts[1] = FHE.toBytes32(post.encryptedSentiment);
        ciphertexts[2] = FHE.toBytes32(post.encryptedKeywords);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeThreat.selector);
        requestToPostId[reqId] = postId;
        
        emit AnalysisRequested(reqId, postId);
    }

    function analyzeThreat(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 postId = requestToPostId[requestId];
        require(postId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory content, uint32 sentiment, uint32 keywords) = 
            abi.decode(cleartexts, (string, uint32, uint32));
        
        // Simulate FHE threat analysis (in production this would be done off-chain)
        analysisCount += 1;
        uint256 newAnalysisId = analysisCount;
        
        // Simplified threat assessment
        uint32 threatScore = calculateThreatScore(content, sentiment, keywords);
        uint32 urgency = determineUrgencyLevel(threatScore);
        
        encryptedAnalyses[newAnalysisId] = EncryptedAnalysis({
            analysisId: newAnalysisId,
            encryptedThreatScore: FHE.asEuint32(threatScore),
            encryptedUrgency: FHE.asEuint32(urgency),
            postId: postId,
            analyzedAt: block.timestamp
        });
        
        decryptedResults[newAnalysisId] = DecryptedResult({
            threatScore: threatScore,
            urgency: urgency,
            isRevealed: false
        });
        
        emit AnalysisCompleted(newAnalysisId);
    }

    function requestResultDecryption(uint256 analysisId) public onlyAuthorized {
        EncryptedAnalysis storage analysis = encryptedAnalyses[analysisId];
        require(!decryptedResults[analysisId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(analysis.encryptedThreatScore);
        ciphertexts[1] = FHE.toBytes32(analysis.encryptedUrgency);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysis.selector);
        analysisRequestToId[reqId] = analysisId;
    }

    function decryptAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 analysisId = analysisRequestToId[requestId];
        require(analysisId != 0, "Invalid request");
        
        DecryptedResult storage dResult = decryptedResults[analysisId];
        require(!dResult.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 threatScore, uint32 urgency) = abi.decode(cleartexts, (uint32, uint32));
        
        dResult.threatScore = threatScore;
        dResult.urgency = urgency;
        dResult.isRevealed = true;
        
        emit ResultDecrypted(analysisId);
    }

    function getDecryptedResult(uint256 analysisId) public view returns (
        uint32 threatScore,
        uint32 urgency,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[analysisId];
        return (r.threatScore, r.urgency, r.isRevealed);
    }

    function getEncryptedPost(uint256 postId) public view returns (
        euint32 content,
        euint32 sentiment,
        euint32 keywords,
        uint256 timestamp
    ) {
        EncryptedPost storage p = encryptedPosts[postId];
        return (p.encryptedContent, p.encryptedSentiment, p.encryptedKeywords, p.timestamp);
    }

    function getEncryptedAnalysis(uint256 analysisId) public view returns (
        euint32 threatScore,
        euint32 urgency,
        uint256 postId,
        uint256 analyzedAt
    ) {
        EncryptedAnalysis storage a = encryptedAnalyses[analysisId];
        return (a.encryptedThreatScore, a.encryptedUrgency, a.postId, a.analyzedAt);
    }

    // Helper functions for demo purposes
    function calculateThreatScore(string memory content, uint32 sentiment, uint32 keywords) private pure returns (uint32) {
        // Simplified threat scoring
        uint32 score = keywords * 10;
        if (sentiment < 30) {
            score += 20;
        }
        return score > 100 ? 100 : score;
    }

    function determineUrgencyLevel(uint32 threatScore) private pure returns (uint32) {
        // Simplified urgency determination
        if (threatScore > 80) return 3; // High urgency
        if (threatScore > 50) return 2; // Medium urgency
        return 1; // Low urgency
    }
}