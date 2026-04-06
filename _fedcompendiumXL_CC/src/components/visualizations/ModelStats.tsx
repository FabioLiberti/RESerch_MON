import React from 'react';
import {
  Box,
  Text,
  useColorModeValue,
  Flex,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  SimpleGrid,
  Divider,
  Tooltip
} from '@chakra-ui/react';
import { 
  FiBarChart2, 
  FiTrendingUp, 
  FiClock, 
  FiZap, 
  FiHelpCircle 
} from 'react-icons/fi';
import { IconBox } from './utils/IconUtils';

interface ModelStatsProps {
  accuracy: number;
  previousAccuracy?: number;
  loss: number;
  previousLoss?: number;
  convergenceRate: number;
  roundsCompleted: number;
  totalRounds: number;
  communicationCost?: number;
}

export const ModelStats: React.FC<ModelStatsProps> = ({
  accuracy,
  previousAccuracy,
  loss,
  previousLoss,
  convergenceRate,
  roundsCompleted,
  totalRounds,
  communicationCost,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtleTextColor = useColorModeValue('gray.600', 'gray.400');
  
  // Calculate deltas
  const accuracyDelta = previousAccuracy !== undefined 
    ? accuracy - previousAccuracy
    : undefined;
  
  const lossDelta = previousLoss !== undefined
    ? loss - previousLoss
    : undefined;
  
  // Helper function to format large numbers with K/M suffix
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };
  
  return (
    <Box
      p={4}
      borderRadius="lg"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Heading size="sm" mb={4} color={textColor}>
        Model Performance Metrics
      </Heading>
      
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* Accuracy Stat */}
        <Stat>
          <Flex align="center">
            <IconBox 
              icon={FiBarChart2} 
              size={18} 
              color="blue.500" 
              display="inline-flex" 
              mr={2} 
            />
            <StatLabel color={subtleTextColor}>Accuracy</StatLabel>
            <Tooltip 
              label="Model prediction accuracy on validation data" 
              placement="top"
            >
              <Box ml={1}>
                <IconBox 
                  icon={FiHelpCircle} 
                  size={12} 
                  display="inline-flex" 
                  color={subtleTextColor} 
                  boxSize={3} 
                />
              </Box>
            </Tooltip>
          </Flex>
          <StatNumber color={textColor}>{(accuracy * 100).toFixed(1)}%</StatNumber>
          {accuracyDelta !== undefined && (
            <StatHelpText>
              <StatArrow 
                type={accuracyDelta >= 0 ? 'increase' : 'decrease'} 
              />
              {Math.abs(accuracyDelta * 100).toFixed(1)}%
            </StatHelpText>
          )}
        </Stat>
        
        {/* Loss Stat */}
        <Stat>
          <Flex align="center">
            <IconBox 
              icon={FiTrendingUp} 
              size={18} 
              color="orange.500" 
              display="inline-flex" 
              mr={2} 
            />
            <StatLabel color={subtleTextColor}>Loss</StatLabel>
            <Tooltip 
              label="Training loss value (lower is better)" 
              placement="top"
            >
              <Box ml={1}>
                <IconBox 
                  icon={FiHelpCircle} 
                  size={12} 
                  display="inline-flex" 
                  color={subtleTextColor} 
                  boxSize={3} 
                />
              </Box>
            </Tooltip>
          </Flex>
          <StatNumber color={textColor}>{loss.toFixed(3)}</StatNumber>
          {lossDelta !== undefined && (
            <StatHelpText>
              <StatArrow 
                type={lossDelta <= 0 ? 'decrease' : 'increase'} 
              />
              {Math.abs(lossDelta).toFixed(3)}
            </StatHelpText>
          )}
        </Stat>
      </SimpleGrid>
      
      <Divider my={4} />
      
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* Training Progress */}
        <Stat>
          <Flex align="center">
            <IconBox 
              icon={FiClock} 
              size={18} 
              color="purple.500" 
              display="inline-flex" 
              mr={2}
            />
            <StatLabel color={subtleTextColor}>Training Progress</StatLabel>
          </Flex>
          <Flex align="center" mt={1}>
            <StatNumber color={textColor} fontSize="lg">
              {roundsCompleted} / {totalRounds}
            </StatNumber>
            <Text ml={2} fontSize="sm" color={subtleTextColor}>
              rounds
            </Text>
          </Flex>
          <Box mt={2} w="100%">
            <Box
              w="100%"
              h="4px"
              bg="gray.200"
              _dark={{ bg: 'gray.700' }}
              borderRadius="full"
              overflow="hidden"
            >
              <Box 
                h="100%" 
                w={`${(roundsCompleted / totalRounds) * 100}%`} 
                bg="purple.500"
                borderRadius="full"
              />
            </Box>
          </Box>
        </Stat>
        
        {/* Communication Cost or Convergence Rate */}
        <Stat>
          {communicationCost ? (
            <>
              <Flex align="center">
                <IconBox 
                  icon={FiZap} 
                  size={18} 
                  color="yellow.500" 
                  display="inline-flex" 
                  mr={2}
                />
                <StatLabel color={subtleTextColor}>Communication</StatLabel>
                <Tooltip 
                  label="Total volume of data transferred between clients and server" 
                  placement="top"
                >
                  <Box ml={1}>
                    <IconBox 
                      icon={FiHelpCircle} 
                      size={12} 
                      display="inline-flex" 
                      color={subtleTextColor} 
                      boxSize={3}
                    />
                  </Box>
                </Tooltip>
              </Flex>
              <StatNumber color={textColor}>
                {formatNumber(communicationCost)}
              </StatNumber>
              <StatHelpText>
                parameters exchanged
              </StatHelpText>
            </>
          ) : (
            <>
              <Flex align="center">
                <IconBox 
                  icon={FiZap} 
                  size={18} 
                  color="green.500" 
                  display="inline-flex" 
                  mr={2}
                />
                <StatLabel color={subtleTextColor}>Convergence Rate</StatLabel>
                <Tooltip 
                  label="Average accuracy improvement per round" 
                  placement="top"
                >
                  <Box ml={1}>
                    <IconBox 
                      icon={FiHelpCircle} 
                      size={12} 
                      display="inline-flex" 
                      color={subtleTextColor} 
                      boxSize={3}
                    />
                  </Box>
                </Tooltip>
              </Flex>
              <StatNumber color={textColor}>
                {(convergenceRate * 100).toFixed(2)}%
              </StatNumber>
              <StatHelpText>
                per round
              </StatHelpText>
            </>
          )}
        </Stat>
      </SimpleGrid>
    </Box>
  );
};

export default ModelStats;